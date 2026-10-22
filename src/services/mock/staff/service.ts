import {
  DomainError, STAFF_POLICY, aheadForNewToken, breakImpactMin, callEntry, callToken, closeEntry, currentAt, estimateWait, finishServing,
  heldAt, holdEntry, isCallable, markTokenNoShow, pickNext, pinLockRemainingMs, recallEntry, recallToken, registerWrongPin, reopenEntry, reopenToken,
  resumeEntry, shouldNudge, snoozeUntil, sortEntries, startServing, summarizeDay, transferEntry, transferToken, validateEmployeeId,
  validateName, validateNote, validatePhone, validatePin, validatePrioritySafe, withNote, formatTokenCode, IDLE_SHIFT,
  type BreakReason, type Branch, type EpochMs, type ID, type QueueEntry, type StaffSession,
} from "@/domain";
import { STAFF_SERVICE_MS } from "./live";
import { clock } from "@/lib/clock";
import { GROUPS, findService, getBranches } from "../catalogue";
import { loadDb, mutate, onDbChange, uid, type MockTokenRow } from "../db";
import { ctxFor } from "../engine";
import { nextNumber } from "../queue";
import type {
  BreakInfo, CallOptions, CounterOption, CounterState, QueueScope, QueueState, Roster, StaffBranch, StaffDevApi, StaffService, TodayState, WalkInResult,
} from "../../staff-types";
import { DEMO_PIN, accountByEmployeeId, accountById, type StaffAccount } from "./accounts";
import {
  buildEntries, counterOptions, dayKeyOf, ensureFloor, ensureHistory, groupIdsOf, settleEntry, shiftToday, toQueueEntry,
} from "./floor";
import { counterNumbersOnBreak, loadFloor, mutateFloor, onFloorChange, resetFloor, type MockEntryRecord, type ShiftRow } from "./store";

/* ----------------------------------------------------------------------- context */

interface Ctx {
  now: EpochMs;
  account: StaffAccount;
  branch: Branch;
  dateKey: string;
  shift: ShiftRow | null;
}

function ctxNow(): Ctx {
  const now = clock.now();
  const f = loadFloor();
  const s = f.session;
  if (!s || s.expiresAt <= now) throw new DomainError("not_signed_in");
  const account = accountById(s.staffId);
  const branch = getBranches(now).find((b) => b.id === account?.branchId);
  if (!account || !branch) throw new DomainError("not_signed_in");
  const dateKey = dayKeyOf(branch, now);
  return { now, account, branch, dateKey, shift: shiftToday(f, account.id, dateKey) };
}

/** Context for actions that need an open shift (not idle, ended or on a break). */
function ctxOpen(): Ctx & { shift: ShiftRow; counter: number } {
  const c = ctxNow();
  if (!c.shift || c.shift.status === "idle" || c.shift.status === "ended" || c.shift.counter == null) throw new DomainError("shift_not_started");
  if (c.shift.status === "break") throw new DomainError("shift_on_break");
  return { ...c, shift: c.shift, counter: c.shift.counter };
}

const staffBranch = (b: Branch): StaffBranch => ({ id: b.id, name: b.name, bankName: b.bank.name, bankShort: b.bank.shortName, timezone: b.timezone });

const writeShift = (c: Ctx, patch: Partial<ShiftRow>) =>
  mutateFloor((f) => {
    const base: ShiftRow = c.shift ?? { ...IDLE_SHIFT, dateKey: c.dateKey, branchId: c.branch.id };
    f.shifts[c.account.id] = { ...base, ...patch, dateKey: c.dateKey, branchId: c.branch.id };
  });

/* ----------------------------------------------------------------- finding people */

type Target = { kind: "live"; row: MockTokenRow } | { kind: "entry"; rec: MockEntryRecord };

function findTarget(id: ID, now: EpochMs): Target | null {
  const row = loadDb().tokens[id];
  if (row) return { kind: "live", row };
  const rec = loadFloor().entries[id];
  return rec ? { kind: "entry", rec: settleEntry(rec, now) } : null;
}

const saveRow = (row: MockTokenRow, patch: Partial<MockTokenRow>) =>
  mutate((db) => {
    db.tokens[row.id] = { ...row, ...patch };
  });

const saveEntry = (rec: MockEntryRecord) =>
  mutateFloor((f) => {
    f.entries[rec.id] = rec;
  });

const patchOverlay = (id: ID, fn: (o: { note: string | null; held: boolean; recalls: number; closedBy: "staff" | "auto" | null }) => void) =>
  mutateFloor((f) => {
    const o = f.overlays[id] ?? { note: null, held: false, recalls: 0, closedBy: null };
    fn(o);
    f.overlays[id] = o;
  });

const need = (id: ID, now: EpochMs): Target => {
  const t = findTarget(id, now);
  if (!t) throw new DomainError("entry_not_found");
  return t;
};

/* -------------------------------------------------------------------- the actions */

function callTarget(id: ID, counter: number, now: EpochMs) {
  const t = need(id, now);
  if (t.kind === "live") {
    const { record } = callToken(t.row, ctxFor(t.row), now, counter);
    // Staff decide when the visit ends, so the customer simulation must not auto-finish it.
    saveRow(t.row, { ...record, serviceMs: STAFF_SERVICE_MS });
    patchOverlay(id, (o) => { o.closedBy = null; o.held = false; o.recalls = 0; });
  } else {
    saveEntry(callEntry(t.rec, now, counter));
  }
}

function closeTarget(id: ID, as: "served" | "no_show", now: EpochMs) {
  const t = need(id, now);
  if (t.kind === "live") {
    const ctx = ctxFor(t.row);
    const { record } = as === "served" ? finishServing(t.row, ctx, now) : markTokenNoShow(t.row, ctx, now);
    saveRow(t.row, record);
    patchOverlay(id, (o) => { o.closedBy = "staff"; o.held = false; });
  } else {
    saveEntry(closeEntry(t.rec, as, now, "staff"));
  }
}

/** Close whoever is at the counter. Someone who has not arrived must be closed as a no-show on purpose. */
function closeCurrent(cur: QueueEntry, closeAs: "served" | "no_show" | undefined, now: EpochMs) {
  if (cur.status === "serving") return closeTarget(cur.id, "served", now);
  if (!closeAs) throw new DomainError("current_not_arrived");
  if (closeAs !== "no_show") throw new DomainError("invalid_state", "Only a customer who has arrived can be marked as served");
  closeTarget(cur.id, "no_show", now);
}

/* -------------------------------------------------------------------- state views */

function openCountersOf(branch: Branch, groupId: ID): { total: number; open: number } {
  const total = branch.counters.filter((c) => c.groupIds.includes(groupId)).map((c) => c.number);
  const away = counterNumbersOnBreak(branch.id);
  return { total: total.length, open: total.filter((n) => !away.includes(n)).length };
}

function counterOption(branch: Branch, f: ReturnType<typeof loadFloor>, dateKey: string, n: number): CounterOption {
  const opt = counterOptions(branch, f, dateKey).find((c) => c.number === n);
  if (!opt) throw new DomainError("counter_not_found");
  return opt;
}

function counterState(c: Ctx): CounterState {
  const { now, account, branch } = c;
  if (!c.shift || c.shift.counter == null || c.shift.status === "idle" || c.shift.status === "ended") throw new DomainError("shift_not_started");
  ensureFloor(branch, now);
  const f = loadFloor();
  const counter = c.shift.counter;
  const mine = groupIdsOf(branch, counter);
  const entries = buildEntries(branch, now);
  const current = currentAt(entries, counter);
  const waitingMine = entries.filter((e) => e.status === "waiting" && mine.includes(e.groupId));
  const closedMine = entries.filter((e) => e.counter === counter && (e.status === "served" || e.status === "no_show"));
  const summary = summarizeDay(closedMine, now, branch.timezone);
  const options = counterOptions(branch, f, c.dateKey);

  let onBreak: BreakInfo | null = null;
  if (c.shift.status === "break" && c.shift.breakReason && c.shift.breakStartedAt != null) {
    const gid = mine[0];
    const services = gid ? (GROUPS.find((g) => g.id === gid)?.services ?? []) : [];
    const avg = services.length ? services.reduce((n, s) => n + s.avgServiceMin, 0) / services.length : 6;
    const { total, open } = gid ? openCountersOf(branch, gid) : { total: 1, open: 1 };
    const waiting = gid ? entries.filter((e) => e.status === "waiting" && e.groupId === gid).length : 0;
    onBreak = { reason: c.shift.breakReason, startedAt: c.shift.breakStartedAt, impactMin: breakImpactMin(waiting, avg, total, open) };
  }

  const transferTargets = current
    ? options
        .filter((o) => o.number !== counter && o.groupIds.includes(current.groupId) && o.takenBy != null && !o.onBreak)
        .map((o) => ({ ...o, busy: currentAt(entries, o.number) != null }))
    : [];

  return {
    staff: account, branch: staffBranch(branch), counter: counterOption(branch, f, c.dateKey, counter), shift: c.shift, now,
    waitingMine: waitingMine.length, served: summary.served, avgServiceMs: summary.avgServiceMs, current, held: heldAt(entries, counter),
    next: sortEntries(waitingMine).slice(0, 4), nextCallable: pickNext(entries, mine),
    nudge: shouldNudge(current, now, c.shift.nudgeSnoozedUntil), onBreak, transferTargets,
  };
}

const fresh = (): CounterState => counterState(ctxNow());

function rosterOf(c: Ctx): Roster {
  const { now, account, branch } = c;
  ensureFloor(branch, now);
  const f = loadFloor();
  const options = counterOptions(branch, f, c.dateKey);
  const shift: ShiftRow = c.shift ?? { ...IDLE_SHIFT, dateKey: c.dateKey, branchId: branch.id };
  const waiting = buildEntries(branch, now).filter((e) => e.status === "waiting").length;
  const last = shift.status === "ended" ? (f.lastShift[account.id] ?? null) : null;
  return {
    staff: account, branch: staffBranch(branch), dateKey: c.dateKey, assigned: counterOption(branch, f, c.dateKey, account.counter),
    shiftStart: account.shiftStart, shiftEnd: account.shiftEnd, shift, counters: options,
    countersOpen: options.filter((o) => o.takenBy != null && !o.onBreak).length, countersTotal: options.length, waiting, lastShift: last,
  };
}

/* ------------------------------------------------------------------------ service */

export function createStaffService(): StaffService {
  return {
    capabilities: () => ({ passkey: false }),

    async getSession(): Promise<StaffSession | null> {
      try {
        const c = ctxNow();
        const s = loadFloor().session;
        return { staff: c.account, expiresAt: (s as NonNullable<typeof s>).expiresAt };
      } catch {
        return null;
      }
    },

    async signIn({ employeeId, pin }) {
      const now = clock.now();
      const id = validateEmployeeId(employeeId);
      if (!id.ok) throw new DomainError("invalid_credentials", id.error);
      const p = validatePin(pin);
      if (!p.ok) throw new DomainError("invalid_credentials", p.error);
      return mutateFloor((f) => {
        const lock = pinLockRemainingMs(f.attempts[id.value], now);
        if (lock > 0) throw new DomainError("account_locked", undefined, { retryAfterMs: lock });
        const account = accountByEmployeeId(id.value);
        if (!account || pin !== DEMO_PIN) {
          f.attempts[id.value] = registerWrongPin(f.attempts[id.value], now);
          const after = pinLockRemainingMs(f.attempts[id.value], now);
          if (after > 0) throw new DomainError("account_locked", undefined, { retryAfterMs: after });
          throw new DomainError("invalid_credentials");
        }
        delete f.attempts[id.value];
        const expiresAt = now + STAFF_POLICY.sessionMs;
        f.session = { staffId: account.id, expiresAt };
        return { staff: account, expiresAt };
      });
    },

    async signOut() {
      mutateFloor((f) => {
        f.session = null;
      });
    },

    async roster() {
      return rosterOf(ctxNow());
    },

    async startShift(counter) {
      const c = ctxNow();
      const target = counter ?? c.account.counter;
      const f = loadFloor();
      const opt = counterOptions(c.branch, f, c.dateKey).find((o) => o.number === target);
      if (!opt) throw new DomainError("counter_not_found");
      if (opt.takenBy && opt.takenBy !== c.account.name) throw new DomainError("counter_taken");
      const already = c.shift && (c.shift.status === "open" || c.shift.status === "break") && c.shift.counter === target;
      ensureFloor(c.branch, c.now);
      ensureHistory(c.branch, target, c.now);
      if (!already) {
        writeShift(c, {
          status: "open", counter: target, startedAt: c.now, endedAt: null, breakReason: null, breakStartedAt: null, callNextPresses: 0, nudgeSnoozedUntil: null,
        });
      }
      return fresh();
    },

    async startBreak(reason: BreakReason) {
      const c = ctxNow();
      if (!c.shift || c.shift.counter == null || (c.shift.status !== "open" && c.shift.status !== "break")) throw new DomainError("shift_not_started");
      // Picking another reason while already away just relabels the break.
      if (c.shift.status === "break") {
        writeShift(c, { breakReason: reason });
        return fresh();
      }
      const entries = buildEntries(c.branch, c.now);
      if (currentAt(entries, c.shift.counter) || heldAt(entries, c.shift.counter).length) throw new DomainError("finish_current_first");
      writeShift(c, { status: "break", breakReason: reason, breakStartedAt: c.now });
      return fresh();
    },

    async resumeFromBreak() {
      const c = ctxNow();
      if (!c.shift || c.shift.status !== "break") throw new DomainError("invalid_state", "Not on a break");
      writeShift(c, { status: "open", breakReason: null, breakStartedAt: null });
      return fresh();
    },

    async endShift() {
      const c = ctxNow();
      if (!c.shift || c.shift.counter == null || (c.shift.status !== "open" && c.shift.status !== "break")) throw new DomainError("shift_not_started");
      const entries = buildEntries(c.branch, c.now);
      const counter = c.shift.counter;
      if (currentAt(entries, counter) || heldAt(entries, counter).length) throw new DomainError("finish_current_first");
      const closed = entries.filter((e) => e.counter === counter && (e.status === "served" || e.status === "no_show"));
      const summary = summarizeDay(closed, c.now, c.branch.timezone);
      mutateFloor((f) => {
        f.lastShift[c.account.id] = { ...summary, endedAt: c.now };
      });
      writeShift(c, { status: "ended", endedAt: c.now, breakReason: null, breakStartedAt: null });
      return rosterOf(ctxNow());
    },

    async counter() {
      return fresh();
    },

    async callNext(opts: CallOptions = {}) {
      const c = ctxOpen();
      ensureFloor(c.branch, c.now);
      const entries = buildEntries(c.branch, c.now);
      const mine = groupIdsOf(c.branch, c.counter);
      const cur = currentAt(entries, c.counter);

      let next: QueueEntry | null;
      if (opts.entryId) {
        next = entries.find((e) => e.id === opts.entryId) ?? null;
        if (!next) throw new DomainError("entry_not_found");
        if (!mine.includes(next.groupId) || !isCallable(next)) throw new DomainError("entry_not_callable");
      } else {
        next = pickNext(entries, mine);
        if (!next) throw new DomainError("queue_empty");
      }
      if (cur && cur.status !== "serving" && !opts.closeCurrentAs) throw new DomainError("current_not_arrived");

      if (cur) closeCurrent(cur, opts.closeCurrentAs, c.now);
      callTarget(next.id, c.counter, c.now);
      writeShift(c, { callNextPresses: c.shift.callNextPresses + 1, nudgeSnoozedUntil: null });
      return fresh();
    },

    async finishCurrent(as) {
      const c = ctxOpen();
      const cur = currentAt(buildEntries(c.branch, c.now), c.counter);
      if (!cur) throw new DomainError("invalid_state", "Nobody is at your counter");
      closeCurrent(cur, as, c.now);
      writeShift(c, { nudgeSnoozedUntil: null });
      return fresh();
    },

    async recall() {
      const c = ctxOpen();
      const cur = currentAt(buildEntries(c.branch, c.now), c.counter);
      if (!cur) throw new DomainError("invalid_state", "Nobody is at your counter");
      const t = need(cur.id, c.now);
      if (t.kind === "live") {
        const { record } = recallToken(t.row, ctxFor(t.row), c.now, cur.recalls);
        saveRow(t.row, record);
        patchOverlay(cur.id, (o) => { o.recalls += 1; });
      } else {
        saveEntry(recallEntry(t.rec, c.now));
      }
      return fresh();
    },

    async transfer(toCounter) {
      const c = ctxOpen();
      const state = counterState(c);
      const cur = state.current;
      if (!cur) throw new DomainError("invalid_state", "Nobody is at your counter");
      if (!state.transferTargets.length) throw new DomainError("no_other_counter");
      const target = state.transferTargets.find((o) => o.number === toCounter);
      if (!target) throw new DomainError("counter_not_found");
      if (target.busy) throw new DomainError("counter_busy");
      const t = need(cur.id, c.now);
      if (t.kind === "live") {
        const { record } = transferToken(t.row, ctxFor(t.row), c.now, toCounter);
        saveRow(t.row, { ...record, serviceMs: STAFF_SERVICE_MS });
        patchOverlay(cur.id, (o) => { o.held = false; o.recalls = 0; });
      } else {
        saveEntry(transferEntry(t.rec, c.now, toCounter));
      }
      return fresh();
    },

    async hold() {
      const c = ctxOpen();
      const cur = currentAt(buildEntries(c.branch, c.now), c.counter);
      if (!cur) throw new DomainError("invalid_state", "Nobody is at your counter");
      if (cur.status !== "serving") throw new DomainError("invalid_state", "Hold is for a customer who is at your counter");
      const t = need(cur.id, c.now);
      if (t.kind === "live") patchOverlay(cur.id, (o) => { o.held = true; });
      else saveEntry(holdEntry(t.rec));
      return fresh();
    },

    async resume(entryId) {
      const c = ctxOpen();
      const entries = buildEntries(c.branch, c.now);
      if (currentAt(entries, c.counter)) throw new DomainError("counter_busy");
      const held = heldAt(entries, c.counter).find((e) => e.id === entryId);
      if (!held) throw new DomainError("entry_not_found");
      const t = need(entryId, c.now);
      if (t.kind === "live") patchOverlay(entryId, (o) => { o.held = false; });
      else saveEntry(resumeEntry(t.rec));
      return fresh();
    },

    async setNote(note) {
      const c = ctxOpen();
      const n = validateNote(note);
      if (!n.ok) throw new DomainError("invalid_note", n.error);
      const cur = currentAt(buildEntries(c.branch, c.now), c.counter);
      if (!cur) throw new DomainError("invalid_state", "Nobody is at your counter");
      const t = need(cur.id, c.now);
      if (t.kind === "live") patchOverlay(cur.id, (o) => { o.note = n.value; });
      else saveEntry(withNote(t.rec, n.value));
      return fresh();
    },

    async snoozeNudge() {
      const c = ctxOpen();
      const cur = currentAt(buildEntries(c.branch, c.now), c.counter);
      if (cur) writeShift(c, { nudgeSnoozedUntil: snoozeUntil(c.now, cur.avgServiceMin) });
      return fresh();
    },

    async queue(scope: QueueScope): Promise<QueueState> {
      const c = ctxNow();
      ensureFloor(c.branch, c.now);
      const counter = c.shift?.counter ?? c.account.counter;
      const mine = groupIdsOf(c.branch, counter);
      const entries = buildEntries(c.branch, c.now);
      const waitingAll = entries.filter((e) => e.status === "waiting");
      const waitingMine = waitingAll.filter((e) => mine.includes(e.groupId));
      const shown = scope === "mine" ? waitingMine : waitingAll;
      const oldest = shown.length ? Math.min(...shown.map((e) => e.joinedAt)) : null;
      return {
        scope, now: c.now, groupIds: scope === "mine" ? mine : GROUPS.map((g) => g.id), counter, waiting: sortEntries(shown),
        atCounters: entries.filter((e) => e.status === "called" || e.status === "serving").sort((a, b) => (a.counter ?? 0) - (b.counter ?? 0)),
        mineCount: waitingMine.length, allCount: waitingAll.length,
        longestWaitMin: oldest == null ? null : Math.max(0, Math.round((c.now - oldest) / 60_000)),
        myGroupIds: mine, hasCurrent: !!c.shift?.counter && !!currentAt(entries, c.shift.counter),
      };
    },

    async walkInServices() {
      const c = ctxNow();
      return GROUPS.filter((g) => c.branch.counters.some((k) => k.groupIds.includes(g.id))).map((g) => ({
        groupId: g.id, groupName: g.name, services: g.services.map((s) => ({ id: s.id, name: s.name })),
      }));
    },

    async issueWalkIn(input): Promise<WalkInResult> {
      const c = ctxNow();
      const name = validateName(input.name);
      if (!name.ok) throw new DomainError("invalid_name", name.error);
      let phone: string | null = null;
      if (input.phone.trim()) {
        const p = validatePhone(input.phone);
        if (!p.ok) throw new DomainError("invalid_phone", p.error);
        phone = p.value;
      }
      const found = findService(input.serviceId);
      if (!found || !c.branch.counters.some((k) => k.groupIds.includes(found.group.id))) throw new DomainError("service_not_found");
      const priority = validatePrioritySafe(input.priority);

      ensureFloor(c.branch, c.now);
      const waiting = buildEntries(c.branch, c.now).filter((e) => e.status === "waiting" && e.groupId === found.group.id).length;
      const ahead = aheadForNewToken(waiting, { priority, source: "walk_in" });
      const { open } = openCountersOf(c.branch, found.group.id);
      const number = mutate((db) => nextNumber(db, c.branch, found.group.id, c.now));
      const rec: MockEntryRecord = {
        id: uid("ent"), code: formatTokenCode(found.group.tokenPrefix, number), number, branchId: c.branch.id, serviceId: found.service.id, groupId: found.group.id,
        name: name.value, phone, origin: "counter", priority, joinedAt: c.now, orderAt: c.now, calledAt: null, counter: null, arrivedAt: null, repliedAt: null,
        closedAt: null, closeKind: null, closedBy: null, held: false, note: null, recalls: 0,
        // A walk-in is in the waiting area, so they walk up promptly when called.
        sim: { replyAfterMs: 0, arriveAfterMs: 12_000, noReply: false },
      };
      saveEntry(rec);
      return { entry: toQueueEntry(rec), ahead, estWait: estimateWait(ahead, found.service.avgServiceMin, Math.max(1, open)) };
    },

    async today(): Promise<TodayState> {
      const c = ctxNow();
      ensureFloor(c.branch, c.now);
      const shift: ShiftRow = c.shift ?? { ...IDLE_SHIFT, dateKey: c.dateKey, branchId: c.branch.id };
      const counter = shift.counter;
      const entries = buildEntries(c.branch, c.now);
      const mine = counter != null ? groupIdsOf(c.branch, counter) : [];
      const closed = counter == null ? [] : entries.filter((e) => e.counter === counter && (e.status === "served" || e.status === "no_show"));
      return {
        staff: c.account, branch: staffBranch(c.branch), counter, shift, now: c.now, summary: summarizeDay(closed, c.now, c.branch.timezone),
        autoClosed: closed.filter((e) => e.status === "no_show" && e.closedBy === "auto").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)),
        hasCurrent: counter != null && !!currentAt(entries, counter),
        waitingMine: entries.filter((e) => e.status === "waiting" && mine.includes(e.groupId)).length,
      };
    },

    async undoClosure(entryId) {
      const c = ctxOpen();
      const entries = buildEntries(c.branch, c.now);
      if (currentAt(entries, c.counter)) throw new DomainError("counter_busy");
      const e = entries.find((x) => x.id === entryId && x.counter === c.counter);
      if (!e || e.status !== "no_show" || e.closedBy !== "auto") throw new DomainError("entry_not_found");
      const t = need(entryId, c.now);
      if (t.kind === "live") {
        saveRow(t.row, { ...reopenToken(t.row, c.now, c.counter), serviceMs: STAFF_SERVICE_MS });
        patchOverlay(entryId, (o) => { o.closedBy = null; });
      } else {
        saveEntry(reopenEntry(t.rec, c.now, c.counter));
      }
      return this.today();
    },

    subscribe(onChange) {
      const offs = [onFloorChange(onChange), onDbChange(onChange)];
      return () => offs.forEach((off) => off());
    },
  };
}

/* ---------------------------------------------------------------------- dev tools */

export function createStaffDevApi(): StaffDevApi {
  return {
    async addCustomers(count) {
      const c = ctxNow();
      const counter = c.shift?.counter ?? c.account.counter;
      const mine = groupIdsOf(c.branch, counter);
      for (let i = 0; i < count; i++) {
        const gid = mine[i % Math.max(1, mine.length)];
        const group = GROUPS.find((g) => g.id === gid);
        if (!group) continue;
        const number = mutate((db) => nextNumber(db, c.branch, group.id, c.now));
        const seed = `${c.now}|${number}`;
        const h = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
        const service = group.services[h % group.services.length] as (typeof group.services)[number];
        saveEntry({
          id: uid("ent"), code: formatTokenCode(group.tokenPrefix, number), number, branchId: c.branch.id, serviceId: service.id, groupId: group.id,
          name: ["Asha", "Dev", "Lata", "Rohan", "Zoya"][h % 5] ?? null, phone: null, origin: "app", priority: [], joinedAt: c.now, orderAt: c.now,
          calledAt: null, counter: null, arrivedAt: null, repliedAt: null, closedAt: null, closeKind: null, closedBy: null, held: false, note: null, recalls: 0,
          sim: { replyAfterMs: 6_000, arriveAfterMs: 14_000, noReply: false },
        });
      }
    },

    async arriveNow() {
      const c = ctxOpen();
      const cur = currentAt(buildEntries(c.branch, c.now), c.counter);
      if (!cur || cur.status !== "called") return;
      const t = need(cur.id, c.now);
      if (t.kind === "live") saveRow(t.row, startServing(t.row, ctxFor(t.row), c.now).record);
      else saveEntry({ ...t.rec, arrivedAt: c.now, repliedAt: t.rec.repliedAt ?? c.now });
    },

    async resetFloor() {
      resetFloor();
    },
  };
}
