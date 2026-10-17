import { DomainError } from "./errors";
import { estimateWait, NO_WAIT, waitMid } from "./wait";
import type { Policy } from "./policy";
import type { EpochMs, TokenEvent, TokenRecord, TokenStage, TokenView, WaitRange } from "./types";

/**
 * The token state machine.
 *
 * A TokenRecord stores only facts (when it joined, when it was confirmed, when it was called ...).
 * What the customer sees (position, stage, countdowns) is a pure function of those facts and the
 * clock. That keeps the logic testable and means a backend can implement the same rules in SQL or
 * an edge function and return the same TokenView.
 *
 *   waiting ──(≤ nearThreshold ahead)──▶ checkin ──confirm──▶ waiting ──(0 ahead)──▶ called
 *      ▲                                   │ lapse (not confirmed in time, or turn arrives)
 *      └──────── setback positions ◀───────┘     more than maxLapses lapses ▶ missed
 *   called ──on my way──▶ serving ──▶ served          called ──deadline──▶ missed
 *   waiting | checkin | called ──leave──▶ left
 *
 * Time is "virtual" in one place only: `timing.stepMs`, how long one position takes to clear in the
 * mock. Windows the customer has to react in (check-in, reach the counter) are always real time.
 * A real backend replaces stepMs with the actual call times and drops `reconcile`'s serving logic.
 */

export interface QueueTiming {
  /** Milliseconds for the line to move forward by one person. */
  stepMs: number;
  /** Milliseconds between "I am on my way" and the counter starting to serve (mock staff). */
  arriveMs: number;
  /** Milliseconds a visit takes at the counter before it is closed (mock staff). */
  serviceMs: number;
}

export interface QueueContext {
  policy: Policy;
  timing: QueueTiming;
  /** Which counter a token will be sent to. Deterministic so the map and the call agree. */
  counterFor: (record: TokenRecord) => number | null;
}

export interface ReconcileResult {
  record: TokenRecord;
  events: TokenEvent[];
}

const isTerminal = (r: TokenRecord) => r.servedAt != null || r.missedAt != null || r.leftAt != null;

/** Base number of people ahead if no time had passed, including setbacks. */
const baseAhead = (r: TokenRecord) => r.aheadAtJoin + r.delayPositions;

/** Epoch when the line has cleared everyone ahead of this token. */
export function turnArrivesAt(r: TokenRecord, timing: QueueTiming): EpochMs {
  return r.joinedAt + timing.stepMs * baseAhead(r);
}

/** Epoch from which `nearThreshold` or fewer people are ahead. */
export function nearArrivesAt(r: TokenRecord, ctx: QueueContext): EpochMs {
  return r.joinedAt + ctx.timing.stepMs * Math.max(0, baseAhead(r) - ctx.policy.nearThreshold);
}

/** People ahead at time `t` for a token that has not been called yet. */
export function aheadAt(r: TokenRecord, timing: QueueTiming, t: EpochMs): number {
  if (r.calledAt != null || isTerminal(r)) return 0;
  const cleared = Math.floor(Math.max(0, t - r.joinedAt) / timing.stepMs);
  return Math.max(0, baseAhead(r) - cleared);
}

export function callDeadline(r: TokenRecord, policy: Policy): EpochMs | null {
  return r.calledAt == null ? null : r.calledAt + policy.calledWindowMs + r.extraTimeMs;
}

/**
 * Advance a record to `now`, applying every transition that happened since it was last reconciled
 * and reporting each milestone once. Idempotent: reconciling twice at the same time is a no-op.
 */
export function reconcile(input: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const events: TokenEvent[] = [];
  const r: TokenRecord = { ...input, priority: [...input.priority] };
  const since = input.reconciledAt;
  const emit = (e: TokenEvent) => {
    if (e.at > since && e.at <= now) events.push(e);
  };
  const { policy, timing } = ctx;

  if (now < since) return { record: r, events }; // never run backwards (dev clock changes)

  if (!isTerminal(r) && r.calledAt == null) {
    // Joined close to the front: standing at the branch just proved presence, no check-in needed.
    if (r.checkinConfirmedAt == null && r.lapseCount === 0 && r.delayPositions === 0 && baseAhead(r) <= policy.nearThreshold) {
      r.checkinConfirmedAt = r.joinedAt;
    }

    for (let guard = 0; guard < 32; guard++) {
      const zeroAt = turnArrivesAt(r, timing);

      if (r.checkinConfirmedAt != null) {
        if (now < zeroAt) break;
        r.calledAt = zeroAt;
        r.counter = ctx.counterFor(r);
        emit({ type: "called", at: zeroAt, counter: r.counter });
        break;
      }

      const promptAt = r.checkinPromptedAt ?? nearArrivesAt(r, ctx);
      r.checkinPromptedAt = promptAt;
      if (now < promptAt) break;
      emit({ type: "nearby", at: promptAt });

      // The prompt ends when time runs out, or when the turn arrives, whichever is first: the
      // counter cannot call someone who has not said they are still here.
      const lapseAt = Math.min(promptAt + policy.checkinWindowMs, zeroAt);
      if (now < lapseAt) break;

      r.lapseCount += 1;
      emit({ type: "checkin_lapsed", at: lapseAt });
      if (r.lapseCount > policy.maxLapses) {
        r.missedAt = lapseAt;
        emit({ type: "missed", at: lapseAt });
        break;
      }
      r.delayPositions += policy.setback;
      r.checkinPromptedAt = Math.max(nearArrivesAt(r, ctx), lapseAt);
    }
  }

  if (!isTerminal(r) && r.calledAt != null) {
    const deadline = callDeadline(r, policy) as EpochMs;

    if (r.servingStartedAt == null && r.onMyWayAt != null) {
      const arriveAt = r.onMyWayAt + timing.arriveMs;
      if (arriveAt <= deadline && arriveAt <= now) {
        r.servingStartedAt = arriveAt;
        emit({ type: "serving", at: arriveAt });
      }
    }

    if (r.servingStartedAt != null) {
      const doneAt = r.servingStartedAt + timing.serviceMs;
      if (now >= doneAt) {
        r.servedAt = doneAt;
        emit({ type: "served", at: doneAt });
      }
    } else if (now > deadline) {
      r.missedAt = deadline;
      emit({ type: "missed", at: deadline });
    }
  }

  r.reconciledAt = now;
  return { record: r, events };
}

/* ------------------------------------------------------------------------ stage */

export function stageOf(r: TokenRecord, ctx: QueueContext, now: EpochMs): TokenStage {
  if (r.leftAt != null) return "left";
  if (r.servedAt != null) return "served";
  if (r.missedAt != null) return "missed";
  if (r.servingStartedAt != null) return "serving";
  if (r.calledAt != null) return "called";
  if (r.checkinConfirmedAt == null && r.checkinPromptedAt != null && now >= r.checkinPromptedAt) return "checkin";
  void ctx;
  return "waiting";
}

/* --------------------------------------------------------------------- actions */

function fresh(r: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  return reconcile(r, ctx, now);
}

/** "Yes, I am still here." Only valid while the prompt is open. */
export function confirmCheckin(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const r = res.record;
  if (stageOf(r, ctx, now) !== "checkin") {
    if (r.lapseCount > r0.lapseCount) throw new DomainError("checkin_expired");
    throw new DomainError("invalid_state", "Check-in is not open for this token");
  }
  return { record: { ...r, checkinConfirmedAt: now }, events: res.events };
}

/** "I am running late, move me back." A choice, so it does not count as a missed check-in. */
export function moveBack(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const stage = stageOf(res.record, ctx, now);
  if (stage !== "waiting" && stage !== "checkin") throw new DomainError("invalid_state", "This token cannot be moved back");
  const r: TokenRecord = {
    ...res.record,
    delayPositions: res.record.delayPositions + ctx.policy.setback,
    checkinConfirmedAt: null,
    checkinPromptedAt: null,
  };
  r.checkinPromptedAt = Math.max(nearArrivesAt(r, ctx), now);
  return { record: r, events: res.events };
}

export function markOnMyWay(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const stage = stageOf(res.record, ctx, now);
  if (res.record.onMyWayAt != null && (stage === "called" || stage === "serving")) return res; // already said so
  if (stage !== "called") throw new DomainError("invalid_state", "You have not been called yet");
  return { record: { ...res.record, onMyWayAt: now }, events: res.events };
}

export function requestMoreTime(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const r = res.record;
  if (stageOf(r, ctx, now) !== "called") throw new DomainError("invalid_state", "You have not been called yet");
  if (r.extensionCount >= ctx.policy.maxExtensions) throw new DomainError("no_more_time");
  return {
    record: { ...r, extensionCount: r.extensionCount + 1, extraTimeMs: r.extraTimeMs + ctx.policy.extraTimeMs },
    events: res.events,
  };
}

export function leaveQueue(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const stage = stageOf(res.record, ctx, now);
  if (stage === "serving" || stage === "served" || stage === "missed" || stage === "left") {
    throw new DomainError("invalid_state", "This token can no longer be cancelled");
  }
  return { record: { ...res.record, leftAt: now }, events: res.events };
}

/** Mock staff: start serving now (the counter scanned or called the customer in). */
export function startServing(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  if (stageOf(res.record, ctx, now) !== "called") throw new DomainError("invalid_state", "Not at a counter yet");
  return { record: { ...res.record, onMyWayAt: res.record.onMyWayAt ?? now, servingStartedAt: now }, events: [...res.events, { type: "serving", at: now }] };
}

/** Mock staff: close the visit now. */
export function finishServing(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const stage = stageOf(res.record, ctx, now);
  if (stage !== "serving" && stage !== "called") throw new DomainError("invalid_state", "Nothing to finish");
  const r = { ...res.record };
  r.servingStartedAt = r.servingStartedAt ?? now;
  r.servedAt = now;
  return { record: r, events: [...res.events, { type: "served", at: now }] };
}

/* ------------------------------------------------------------------------ view */

export interface ViewInfo {
  branchName: string;
  branchSlug: string;
  bankName: string;
  bankSlug: string;
  serviceName: string;
  bring: string[];
  avgServiceMin: number;
  /** Counters working this service group. */
  counters: number;
  /** Typical wait for this service at this branch. */
  usualWait: WaitRange;
}

/** Everything a screen needs about a token. Call on a reconciled record. */
export function deriveView(r: TokenRecord, ctx: QueueContext, now: EpochMs, info: ViewInfo): TokenView {
  const stage = stageOf(r, ctx, now);
  const ahead = aheadAt(r, ctx.timing, now);
  const [prefix = ""] = r.code.split("-");
  const waiting = stage === "waiting" || stage === "checkin";

  const nowServingNumber = waiting && ahead > 0 ? Math.max(1, r.number - Math.max(0, ahead - r.delayPositions)) : r.number;
  const nowServingCode = waiting && ahead > 0 ? `${prefix}-${String(nowServingNumber).padStart(3, "0")}` : stage === "called" || stage === "serving" ? r.code : null;

  const predictedCounter = ahead <= ctx.policy.nearThreshold ? ctx.counterFor(r) : null;
  const counter = r.counter ?? (waiting ? predictedCounter : null);

  const waitedMs = r.calledAt != null ? Math.max(0, r.calledAt - r.joinedAt) : null;
  const savedPositions = Math.max(0, r.aheadAtJoin - ctx.policy.nearThreshold);
  const savedMs = r.calledAt != null ? Math.round(waitMid(estimateWait(savedPositions, info.avgServiceMin, info.counters)) * 60_000) : null;

  const zeroAt = turnArrivesAt(r, ctx.timing);
  const checkinDeadline =
    stage === "checkin" && r.checkinPromptedAt != null ? Math.min(r.checkinPromptedAt + ctx.policy.checkinWindowMs, zeroAt) : null;

  return {
    id: r.id,
    code: r.code,
    number: r.number,
    branchId: r.branchId,
    branchName: info.branchName,
    branchSlug: info.branchSlug,
    bankName: info.bankName,
    bankSlug: info.bankSlug,
    serviceId: r.serviceId,
    serviceName: info.serviceName,
    groupId: r.groupId,
    source: r.source,
    priority: r.priority,
    stage,
    movedBack: Math.round(r.delayPositions / Math.max(1, ctx.policy.setback)),
    ahead,
    position: ahead + 1,
    nowServingCode,
    estWait: waiting ? estimateWait(ahead, info.avgServiceMin, info.counters) : NO_WAIT,
    usualWait: info.usualWait,
    counter,
    counterIsAssigned: r.counter != null,
    joinedAt: r.joinedAt,
    calledAt: r.calledAt,
    callDeadline: stage === "called" ? callDeadline(r, ctx.policy) : null,
    checkinDeadline,
    canRequestMoreTime: stage === "called" && r.extensionCount < ctx.policy.maxExtensions,
    onMyWay: r.onMyWayAt != null,
    servedAt: r.servedAt,
    waitedMs,
    savedMs,
    feedback: r.feedback,
    bring: info.bring,
    updatedAt: now,
  };
}

/** True while the token still needs the customer's attention (drives home card and badges). */
export function isActiveStage(stage: TokenStage): boolean {
  return stage === "waiting" || stage === "checkin" || stage === "called" || stage === "serving";
}
