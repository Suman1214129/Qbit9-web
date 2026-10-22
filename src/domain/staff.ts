import { z } from "zod";
import { DomainError } from "./errors";
import { reconcile, stageOf, type QueueContext, type ReconcileResult } from "./queue";
import { tzParts } from "./time";
import type { FieldResult } from "./validation";
import type { EpochMs, ID, PriorityTag, TokenEvent, TokenRecord } from "./types";
import { estimateWait, waitMid } from "./wait";

/**
 * Staff side rules: who is working where, the order people are called in, what happens to a
 * token when staff call, recall, transfer or close it, and the end of day numbers.
 *
 * Like the rest of `domain/` this is pure: no React, no storage, no clock. Callers pass `now`.
 * A backend implements the same rules (as RPCs or edge functions) and returns the same shapes.
 *
 * Two kinds of customer pass through a counter and both follow the same rules here:
 *  - App tokens: a `TokenRecord` the customer created. Staff actions edit that record, so the
 *    customer's phone sees them (see `callToken`, `recallToken`, ...).
 *  - Counter tokens: an `EntryRecord` staff issued for someone without a phone (walk-in), or a
 *    simulated customer in the mock. Same transitions, see `callEntry`, `recallEntry`, ...
 */

/* ----------------------------------------------------------------------- policy */

/** Sample values, flagged like the rest of `policy.ts`: the bank confirms them. */
export const STAFF_POLICY = {
  /** "Still serving?" shows once a visit takes this many times the usual service time. */
  nudgeFactor: 2,
  /** ...but never sooner than this, so a 3 minute service does not nag at 6 minutes. */
  nudgeMinMs: 5 * 60_000,
  /** How long "Still serving" hides the nudge, as a multiple of the usual service time. */
  snoozeFactor: 1,
  maxRecalls: 2,
  noteMaxLength: 140,
  pinMinLength: 4,
  pinMaxLength: 6,
  maxPinAttempts: 5,
  lockoutMs: 5 * 60_000,
  sessionMs: 8 * 60 * 60_000,
} as const;

/* ------------------------------------------------------------------------ people */

export type StaffRole = "teller" | "admin";

export interface StaffMember {
  id: ID;
  /** What staff type on the sign in screen, e.g. "E48213". */
  employeeId: string;
  name: string;
  branchId: ID;
  role: StaffRole;
}

export interface StaffSession {
  staff: StaffMember;
  expiresAt: EpochMs;
}

export const BREAK_REASONS = ["lunch", "tea", "system_issue"] as const;
export type BreakReason = (typeof BREAK_REASONS)[number];
export const BREAK_LABEL: Record<BreakReason, string> = { lunch: "Lunch", tea: "Tea", system_issue: "System issue" };

export type ShiftStatus = "idle" | "open" | "break" | "ended";

export interface ShiftState {
  status: ShiftStatus;
  counter: number | null;
  startedAt: EpochMs | null;
  endedAt: EpochMs | null;
  breakReason: BreakReason | null;
  breakStartedAt: EpochMs | null;
  /** How many times staff pressed Call next. The Today screen says so. */
  callNextPresses: number;
  /** "Still serving" hides the nudge until this time. */
  nudgeSnoozedUntil: EpochMs | null;
}

export const IDLE_SHIFT: ShiftState = {
  status: "idle",
  counter: null,
  startedAt: null,
  endedAt: null,
  breakReason: null,
  breakStartedAt: null,
  callNextPresses: 0,
  nudgeSnoozedUntil: null,
};

/* --------------------------------------------------------------------- validation */

const employeeIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^E\d{5}$/, { message: "Employee ID looks like E48213" });

const pinSchema = z
  .string()
  .regex(new RegExp(`^\\d{${STAFF_POLICY.pinMinLength},${STAFF_POLICY.pinMaxLength}}$`), {
    message: `PIN is ${STAFF_POLICY.pinMinLength} to ${STAFF_POLICY.pinMaxLength} digits`,
  });

function run<T>(schema: z.ZodType<T>, input: unknown): FieldResult<T> {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues[0]?.message ?? "Invalid" };
}

export const validateEmployeeId = (v: string) => run(employeeIdSchema, v);
export const validatePin = (v: string) => run(pinSchema, v);

export function validateNote(v: string): FieldResult<string | null> {
  const t = v.trim();
  if (t.length > STAFF_POLICY.noteMaxLength) return { ok: false, error: `Keep it under ${STAFF_POLICY.noteMaxLength} characters` };
  return { ok: true, value: t || null };
}

/** Failed PIN attempts per employee. Five wrong tries lock the account for a few minutes. */
export interface PinAttempts {
  count: number;
  lockedUntil: EpochMs | null;
}

export function pinLockRemainingMs(a: PinAttempts | undefined, now: EpochMs): number {
  return a?.lockedUntil != null && a.lockedUntil > now ? a.lockedUntil - now : 0;
}

/** Next attempt state after a wrong PIN. Lock resets the counter. */
export function registerWrongPin(a: PinAttempts | undefined, now: EpochMs): PinAttempts {
  const prev = a && (a.lockedUntil == null || a.lockedUntil <= now) ? a : { count: 0, lockedUntil: null };
  const count = prev.count + 1;
  return count >= STAFF_POLICY.maxPinAttempts ? { count: 0, lockedUntil: now + STAFF_POLICY.lockoutMs } : { count, lockedUntil: null };
}

/* ------------------------------------------------------------------- queue entries */

export type EntryOrigin = "app" | "counter" | "booking";
export type EntryStatus = "waiting" | "called" | "serving" | "served" | "no_show" | "left";
export type ClosedBy = "staff" | "auto";

/** One customer as staff see them. Built by the backend (or the mock) from tokens and counter entries. */
export interface QueueEntry {
  id: ID;
  code: string;
  number: number;
  /** First name for the call. Null when the customer gave none. */
  name: string | null;
  serviceId: ID;
  serviceName: string;
  groupId: ID;
  origin: EntryOrigin;
  /** True when this is a customer's app token (staff actions reach their phone). */
  live: boolean;
  priority: PriorityTag[];
  joinedAt: EpochMs;
  /** What the order is sorted on. Usually `joinedAt`; later for tokens pushed back. */
  orderAt: EpochMs;
  status: EntryStatus;
  held: boolean;
  counter: number | null;
  calledAt: EpochMs | null;
  /** The customer has reached the counter (or said they are on their way, see `replied`). */
  arrivedAt: EpochMs | null;
  /** The customer answered the call ("I am on my way"). */
  replied: boolean;
  /** When the call lapses if the customer has not reached the counter; null unless called. */
  callDeadline: EpochMs | null;
  /** App customers still confirming they are at the branch cannot be called yet. */
  confirming: boolean;
  note: string | null;
  recalls: number;
  closedAt: EpochMs | null;
  closedBy: ClosedBy | null;
  avgServiceMin: number;
}

export const isPriority = (e: Pick<QueueEntry, "priority">) => e.priority.length > 0;

/** The one ordering rule: priority first, then arrival, then token number. Used for every queue. */
export interface QueueOrderKey {
  hasPriority: boolean;
  orderAt: EpochMs;
  number: number;
}

export const compareQueueOrder = (a: QueueOrderKey, b: QueueOrderKey): number =>
  Number(b.hasPriority) - Number(a.hasPriority) || a.orderAt - b.orderAt || a.number - b.number;

const orderKey = (e: Pick<QueueEntry, "priority" | "orderAt" | "number">): QueueOrderKey => ({ hasPriority: isPriority(e), orderAt: e.orderAt, number: e.number });

export const compareEntries = (a: QueueEntry, b: QueueEntry): number => compareQueueOrder(orderKey(a), orderKey(b));

export const sortEntries = (entries: readonly QueueEntry[]): QueueEntry[] => [...entries].sort(compareEntries);

/** Staff can only call someone who has said they are still here. */
export const isCallable = (e: QueueEntry) => e.status === "waiting" && !e.confirming;

/** The next person this counter should call: first callable waiting entry of its service groups. */
export function pickNext(entries: readonly QueueEntry[], groupIds: readonly ID[]): QueueEntry | null {
  return sortEntries(entries.filter((e) => groupIds.includes(e.groupId) && isCallable(e)))[0] ?? null;
}

/** The entry sitting at a counter right now: called or at the window, not held. */
export function currentAt(entries: readonly QueueEntry[], counter: number): QueueEntry | null {
  return entries.filter((e) => e.counter === counter && !e.held && (e.status === "called" || e.status === "serving")).sort((a, b) => (a.calledAt ?? 0) - (b.calledAt ?? 0))[0] ?? null;
}

export const heldAt = (entries: readonly QueueEntry[], counter: number) =>
  entries.filter((e) => e.counter === counter && e.held && e.status === "serving");

/* ------------------------------------------------------------------ the "still serving" nudge */

export function nudgeAfterMs(avgServiceMin: number): number {
  return Math.max(STAFF_POLICY.nudgeMinMs, avgServiceMin * 60_000 * STAFF_POLICY.nudgeFactor);
}

/** Nudge only when something looks off: a visit well past the usual time. Normal work never prompts. */
export function shouldNudge(e: QueueEntry | null, now: EpochMs, snoozedUntil: EpochMs | null): boolean {
  if (!e || e.status !== "serving" || e.held || e.arrivedAt == null) return false;
  if (snoozedUntil != null && now < snoozedUntil) return false;
  return now - e.arrivedAt >= nudgeAfterMs(e.avgServiceMin);
}

export const snoozeUntil = (now: EpochMs, avgServiceMin: number): EpochMs => now + avgServiceMin * 60_000 * STAFF_POLICY.snoozeFactor;

/** Extra minutes customers wait when only `openCounters` of a service's `totalCounters` are working. */
export function breakImpactMin(waiting: number, avgServiceMin: number, totalCounters: number, openCounters: number): number {
  const now = waitMid(estimateWait(waiting, avgServiceMin, Math.max(1, openCounters)));
  const before = waitMid(estimateWait(waiting, avgServiceMin, Math.max(1, totalCounters)));
  return Math.max(0, Math.round(now - before));
}

/* ------------------------------------------------------------ actions on an app token */

const fresh = (r: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult => reconcile(r, ctx, now);

/** Staff call a waiting app token to a counter. Presence is implied by the call: the customer has 5 minutes. */
export function callToken(r0: TokenRecord, ctx: QueueContext, now: EpochMs, counter: number): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const stage = stageOf(res.record, ctx, now);
  if (stage === "checkin") throw new DomainError("entry_not_callable", "Waiting for the customer to confirm they are still here");
  if (stage !== "waiting") throw new DomainError("entry_not_callable");
  const record: TokenRecord = { ...res.record, calledAt: now, counter, checkinConfirmedAt: res.record.checkinConfirmedAt ?? now };
  const events: TokenEvent[] = [...res.events, { type: "called", at: now, counter }];
  return { record, events };
}

/** Call again: the customer gets a fresh full window from now (their own extension is kept if larger). */
export function recallToken(r0: TokenRecord, ctx: QueueContext, now: EpochMs, recallsSoFar: number): ReconcileResult {
  const res = fresh(r0, ctx, now);
  if (stageOf(res.record, ctx, now) !== "called") throw new DomainError("invalid_state", "Only a customer who has not reached the counter can be recalled");
  if (recallsSoFar >= STAFF_POLICY.maxRecalls) throw new DomainError("recall_limit");
  const calledAt = res.record.calledAt ?? now;
  return { record: { ...res.record, extraTimeMs: Math.max(res.record.extraTimeMs, now - calledAt) }, events: res.events };
}

/** Customer did not come. Closes the token as missed. */
export function markTokenNoShow(r0: TokenRecord, ctx: QueueContext, now: EpochMs): ReconcileResult {
  const res = fresh(r0, ctx, now);
  if (stageOf(res.record, ctx, now) !== "called") throw new DomainError("invalid_state", "Only a called customer can be marked as a no-show");
  return { record: { ...res.record, missedAt: now }, events: [...res.events, { type: "missed", at: now }] };
}

/** Undo a no-show: the customer is called again at the counter with a new window. */
export function reopenToken(r0: TokenRecord, now: EpochMs, counter: number): TokenRecord {
  if (r0.missedAt == null || r0.servedAt != null || r0.leftAt != null) throw new DomainError("invalid_state", "Nothing to undo");
  return {
    ...r0,
    missedAt: null,
    calledAt: now,
    counter,
    onMyWayAt: null,
    servingStartedAt: null,
    extraTimeMs: 0,
    extensionCount: 0,
    reconciledAt: now,
  };
}

/** Send a called or serving customer to another counter. They are called again there. */
export function transferToken(r0: TokenRecord, ctx: QueueContext, now: EpochMs, toCounter: number): ReconcileResult {
  const res = fresh(r0, ctx, now);
  const stage = stageOf(res.record, ctx, now);
  if (stage !== "called" && stage !== "serving") throw new DomainError("invalid_state", "Only a customer at your counter can be transferred");
  const record: TokenRecord = { ...res.record, counter: toCounter, calledAt: now, onMyWayAt: null, servingStartedAt: null, extraTimeMs: 0, extensionCount: 0 };
  return { record, events: [...res.events, { type: "called", at: now, counter: toCounter }] };
}

/* ------------------------------------------------------ the same rules on counter entries */

/** A customer staff manage directly: a walk-in without a phone. (The mock also keeps simulated customers here, see services/mock/staff/store.ts.) */
export interface EntryRecord {
  id: ID;
  code: string;
  number: number;
  branchId: ID;
  serviceId: ID;
  groupId: ID;
  name: string | null;
  /** Ten digit mobile the customer asked to be alerted on. Staff only. */
  phone: string | null;
  origin: EntryOrigin;
  priority: PriorityTag[];
  joinedAt: EpochMs;
  orderAt: EpochMs;
  calledAt: EpochMs | null;
  counter: number | null;
  arrivedAt: EpochMs | null;
  /** Answered "on my way" (or walked up) before arriving. */
  repliedAt: EpochMs | null;
  closedAt: EpochMs | null;
  closeKind: "served" | "no_show" | null;
  closedBy: ClosedBy | null;
  held: boolean;
  note: string | null;
  recalls: number;
}

export function entryStatus(r: EntryRecord): EntryStatus {
  if (r.closeKind === "served") return "served";
  if (r.closeKind === "no_show") return "no_show";
  if (r.arrivedAt != null) return "serving";
  if (r.calledAt != null) return "called";
  return "waiting";
}

export function callEntry<T extends EntryRecord>(r: T, now: EpochMs, counter: number): T {
  if (entryStatus(r) !== "waiting") throw new DomainError("entry_not_callable");
  return { ...r, calledAt: now, counter, repliedAt: null, arrivedAt: null };
}

export function recallEntry<T extends EntryRecord>(r: T, now: EpochMs): T {
  if (entryStatus(r) !== "called") throw new DomainError("invalid_state", "Only a customer who has not reached the counter can be recalled");
  if (r.recalls >= STAFF_POLICY.maxRecalls) throw new DomainError("recall_limit");
  return { ...r, calledAt: now, repliedAt: null, recalls: r.recalls + 1 };
}

export function transferEntry<T extends EntryRecord>(r: T, now: EpochMs, toCounter: number): T {
  const s = entryStatus(r);
  if (s !== "called" && s !== "serving") throw new DomainError("invalid_state", "Only a customer at your counter can be transferred");
  return { ...r, counter: toCounter, calledAt: now, repliedAt: null, arrivedAt: null, held: false };
}

export function holdEntry<T extends EntryRecord>(r: T): T {
  if (entryStatus(r) !== "serving") throw new DomainError("invalid_state", "Hold is for a customer who is at your counter");
  return { ...r, held: true };
}

export function resumeEntry<T extends EntryRecord>(r: T): T {
  return { ...r, held: false };
}

export function closeEntry<T extends EntryRecord>(r: T, kind: "served" | "no_show", now: EpochMs, by: ClosedBy): T {
  const s = entryStatus(r);
  if (kind === "served" && s !== "serving") throw new DomainError("invalid_state", "Nothing to finish");
  if (kind === "no_show" && s !== "called") throw new DomainError("invalid_state", "Only a called customer can be marked as a no-show");
  return { ...r, closeKind: kind, closedAt: now, closedBy: by, held: false };
}

export function reopenEntry<T extends EntryRecord>(r: T, now: EpochMs, counter: number): T {
  if (r.closeKind !== "no_show") throw new DomainError("invalid_state", "Nothing to undo");
  return { ...r, closeKind: null, closedAt: null, closedBy: null, calledAt: now, counter, repliedAt: null, arrivedAt: null };
}

export function withNote<T extends { note: string | null }>(r: T, note: string | null): T {
  return { ...r, note };
}

/* ------------------------------------------------------------------------- the day */

export interface HourBucket {
  hour: number;
  count: number;
}

export interface DaySummary {
  served: number;
  noShows: number;
  /** Average time at the counter for served customers, or null before the first one. */
  avgServiceMs: number | null;
  hourly: HourBucket[];
}

/**
 * Numbers for the Today screen from the entries this counter closed today. Hours run from the
 * first closed visit to the current hour so quiet hours show as empty bars, not gaps.
 */
export function summarizeDay(closed: readonly QueueEntry[], now: EpochMs, tz: string): DaySummary {
  const served = closed.filter((e) => e.status === "served");
  const times = served.map((e) => (e.closedAt != null && e.arrivedAt != null ? e.closedAt - e.arrivedAt : null)).filter((t): t is number => t != null && t >= 0);
  const avgServiceMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

  const hours = served.map((e) => tzParts(e.closedAt ?? now, tz).hour);
  const nowHour = tzParts(now, tz).hour;
  const first = hours.length ? Math.min(...hours, nowHour) : nowHour;
  const hourly: HourBucket[] = [];
  for (let h = first; h <= nowHour; h++) hourly.push({ hour: h, count: hours.filter((x) => x === h).length });

  return { served: served.length, noShows: closed.filter((e) => e.status === "no_show").length, avgServiceMs, hourly };
}
