/**
 * The mock "branch floor": everyone staff can see at a branch today.
 *
 * Staff see two kinds of customer, merged into one list of `QueueEntry`:
 *  - App tokens, from the customer mock database. Staff actions edit those rows, so the
 *    customer's phone sees them.
 *  - Counter entries: simulated customers (so a demo has a crowd) and walk-ins staff issue.
 *
 * A real backend replaces all of this with one query over the `tokens` table. Nothing here leaks
 * into the screens: they only ever see `QueueEntry`.
 */
import {
  DEFAULT_POLICY, callDeadline, entryStatus, formatTokenCode, stageOf, reconcile, tzParts,
  type Branch, type ClosedBy, type EpochMs, type ID, type PriorityTag, type QueueEntry, type ServiceGroup, type TokenRecord,
} from "@/domain";
import { GROUPS, ambientWaiting, findService, hash } from "../catalogue";
import { loadDb, mutate, uid, type MockTokenRow } from "../db";
import { ctxFor } from "../engine";
import { nextNumber } from "../queue";
import { NOMINAL_STEP_MS } from "./live";
import { loadFloor, mutateFloor, type FloorDb, type MockEntryRecord, type ShiftRow, type TokenOverlay, staffName } from "./store";
import type { CounterOption } from "../../staff-types";

/** While a service is below its target crowd, one simulated customer arrives this often. */
export const ARRIVAL_GAP_MS = 60_000;

const NAMES = ["Ramesh", "Sunita", "Kiran", "Anil", "Priya", "Mohan", "Farida", "Dev", "Lata", "Imran", "Geeta", "Vikram", "Nisha", "Harish", "Pooja", "Salim"];
const INITIALS = "ABCDGJKMNPRSTV";

export const dayKeyOf = (branch: Pick<Branch, "timezone">, ts: EpochMs) => tzParts(ts, branch.timezone).dateKey;

const groupOf = (groupId: ID): ServiceGroup => GROUPS.find((g) => g.id === groupId) as ServiceGroup;

export const groupIdsOf = (branch: Branch, counter: number): ID[] => branch.counters.find((c) => c.number === counter)?.groupIds ?? [];

const firstNameOf = (name: string | null): string | null => (name ? (name.trim().split(/\s+/)[0] ?? null) : null);

/* ------------------------------------------------------------------- simulation */

function simFor(seed: string) {
  const h = hash(seed);
  const replyAfterMs = 6_000 + (h % 14) * 1_000;
  return { replyAfterMs, arriveAfterMs: replyAfterMs + 8_000 + ((h >> 4) % 18) * 1_000, noReply: (h >> 8) % 8 === 0 };
}

function nameFor(seed: string): string | null {
  const h = hash(`${seed}|name`);
  if (h % 10 < 3) return null;
  return `${NAMES[h % NAMES.length]} ${INITIALS[(h >> 5) % INITIALS.length]}.`;
}

function priorityFor(seed: string): PriorityTag[] {
  const m = hash(`${seed}|prio`) % 12;
  return m < 2 ? ["senior_citizen"] : m === 2 ? ["pensioner"] : [];
}

/** What a simulated customer has done by `now`: replied, arrived, or let the call lapse. */
export function settleEntry(r: MockEntryRecord, now: EpochMs): MockEntryRecord {
  if (!r.sim || r.closeKind || r.calledAt == null) return r;
  if (r.sim.noReply) {
    const lapseAt = r.calledAt + DEFAULT_POLICY.calledWindowMs;
    return now > lapseAt ? { ...r, closeKind: "no_show", closedAt: lapseAt, closedBy: "auto", held: false } : r;
  }
  let out = r;
  if (r.repliedAt == null && now >= r.calledAt + r.sim.replyAfterMs) out = { ...out, repliedAt: r.calledAt + r.sim.replyAfterMs };
  if (r.arrivedAt == null && now >= r.calledAt + r.sim.arriveAfterMs) out = { ...out, arrivedAt: r.calledAt + r.sim.arriveAfterMs, repliedAt: out.repliedAt ?? r.calledAt + r.sim.replyAfterMs };
  return out;
}

/** The size of the crowd this service should show, so demos stay busy without a second person. */
export function targetWaiting(branch: Branch, group: ServiceGroup, now: EpochMs): number {
  const ambient = group.services.reduce((n, s) => n + ambientWaiting(branch.id, s.id, now), 0);
  const floor = group.id === "grp_cash" || group.id === "grp_accounts" ? 2 : 1;
  return Math.min(6, Math.max(floor, Math.round(ambient * 0.5)));
}

function newSimEntry(branch: Branch, group: ServiceGroup, now: EpochMs, joinedAt: EpochMs): MockEntryRecord {
  const number = mutate((db) => nextNumber(db, branch, group.id, now));
  const seed = `${branch.id}|${group.id}|${number}`;
  const h = hash(seed);
  const service = group.services[h % group.services.length] as ServiceGroup["services"][number];
  const kind = (h >> 3) % 5;
  return {
    id: uid("ent"), code: formatTokenCode(group.tokenPrefix, number), number, branchId: branch.id, serviceId: service.id, groupId: group.id,
    name: nameFor(seed), phone: null, origin: kind === 0 ? "booking" : kind === 1 ? "counter" : "app", priority: priorityFor(seed),
    joinedAt, orderAt: joinedAt, calledAt: null, counter: null, arrivedAt: null, repliedAt: null, closedAt: null, closeKind: null, closedBy: null,
    held: false, note: null, recalls: 0, sim: simFor(seed),
  };
}

/**
 * Give today's floor an opening crowd the first time anyone looks, then keep it topped up at a
 * gentle pace while staff work through it.
 */
export function ensureFloor(branch: Branch, now: EpochMs): void {
  const dayStamp = `${branch.id}|${dayKeyOf(branch, now)}`;
  mutateFloor((f) => {
    const first = !f.seeded[dayStamp];
    f.seeded[dayStamp] = true;
    for (const group of GROUPS) {
      const gk = `${dayStamp}|${group.id}`;
      const waitingSim = Object.values(f.entries).filter((e) => e.branchId === branch.id && e.sim && e.groupId === group.id && entryStatus(settleEntry(e, now)) === "waiting").length;
      const need = targetWaiting(branch, group, now) - waitingSim;
      if (need <= 0) continue;
      const due = first || now - (f.lastArrival[gk] ?? 0) >= ARRIVAL_GAP_MS;
      if (!due) continue;
      const add = first ? need : 1;
      for (let i = 0; i < add; i++) {
        const rec = newSimEntry(branch, group, now, now - (add - i) * 40_000);
        f.entries[rec.id] = rec;
      }
      f.lastArrival[gk] = now;
    }
    // Drop anything older than two days so storage does not grow forever.
    for (const [id, e] of Object.entries(f.entries)) if ((e.closedAt ?? e.joinedAt) < now - 2 * 86_400_000) delete f.entries[id];
  });
}

/** Earlier visits for the Today screen, created once per counter per day. Marked as demo data in the UI. */
export function ensureHistory(branch: Branch, counter: number, now: EpochMs): void {
  const dk = dayKeyOf(branch, now);
  const stamp = `${branch.id}|${dk}|hist|${counter}`;
  mutateFloor((f) => {
    if (f.seeded[stamp]) return;
    f.seeded[stamp] = true;
    const groupId = groupIdsOf(branch, counter)[0];
    if (!groupId) return;
    const group = groupOf(groupId);
    const gk = `${branch.id}|${dk}|${group.id}`;
    const base = 40 + (hash(`${branch.id}|${group.id}|${dk}`) % 25);
    const avgMin = group.services.reduce((n, s) => n + s.avgServiceMin, 0) / group.services.length;
    const k = 5 + (hash(stamp) % 6);
    let ptr = f.histNext[gk] ?? base;
    for (let i = 0; i < k; i++) {
      if (ptr < 1) break;
      const seed = `${stamp}|${i}`;
      const h = hash(seed);
      const service = group.services[h % group.services.length] as ServiceGroup["services"][number];
      const durationMs = Math.round(service.avgServiceMin * 60_000 * (0.7 + (h % 7) / 10));
      const closedAt = now - 3 * 60_000 - (k - 1 - i) * Math.round(avgMin * 60_000 * 1.2);
      const rec: MockEntryRecord = {
        id: uid("ent"), code: formatTokenCode(group.tokenPrefix, ptr), number: ptr, branchId: branch.id, serviceId: service.id, groupId: group.id,
        name: nameFor(seed), phone: null, origin: "app", priority: priorityFor(seed), joinedAt: closedAt - durationMs - 10 * 60_000, orderAt: closedAt - durationMs - 10 * 60_000,
        calledAt: closedAt - durationMs - 20_000, counter, arrivedAt: closedAt - durationMs, repliedAt: closedAt - durationMs - 10_000,
        closedAt, closeKind: "served", closedBy: "staff", held: false, note: null, recalls: 0, sim: null,
      };
      f.entries[rec.id] = rec;
      ptr -= 1;
    }
    if (hash(stamp) % 3 === 0 && ptr >= 1) {
      const closedAt = now - 40 * 60_000;
      const rec: MockEntryRecord = {
        id: uid("ent"), code: formatTokenCode(group.tokenPrefix, ptr), number: ptr, branchId: branch.id, serviceId: (group.services[0] as ServiceGroup["services"][number]).id, groupId: group.id,
        name: null, phone: null, origin: "app", priority: [], joinedAt: closedAt - 15 * 60_000, orderAt: closedAt - 15 * 60_000,
        calledAt: closedAt - DEFAULT_POLICY.calledWindowMs, counter, arrivedAt: null, repliedAt: null,
        closedAt, closeKind: "no_show", closedBy: "auto", held: false, note: null, recalls: 0, sim: null,
      };
      f.entries[rec.id] = rec;
      ptr -= 1;
    }
    f.histNext[gk] = ptr;
  });
}

/* ------------------------------------------------------------------- build entries */

export function toQueueEntry(r: MockEntryRecord): QueueEntry {
  const status = entryStatus(r);
  const found = findService(r.serviceId);
  return {
    id: r.id, code: r.code, number: r.number, name: firstNameOf(r.name), serviceId: r.serviceId, serviceName: found?.service.name ?? "Service",
    groupId: r.groupId, origin: r.origin, live: false, priority: r.priority, joinedAt: r.joinedAt, orderAt: r.orderAt, status, held: r.held && status === "serving",
    counter: r.counter, calledAt: r.calledAt, arrivedAt: r.arrivedAt, replied: r.repliedAt != null || r.arrivedAt != null,
    callDeadline: status === "called" && r.calledAt != null ? r.calledAt + DEFAULT_POLICY.calledWindowMs : null,
    confirming: false, note: r.note, recalls: r.recalls, closedAt: r.closedAt, closedBy: r.closedBy, avgServiceMin: found?.service.avgServiceMin ?? 6,
  };
}

function fromTokenRow(row: MockTokenRow, rec: TokenRecord, now: EpochMs, name: string | null, overlay: TokenOverlay | undefined): QueueEntry | null {
  const ctx = ctxFor(row);
  const stage = stageOf(rec, ctx, now);
  if (stage === "left") return null;
  const found = findService(row.serviceId);
  const status = stage === "checkin" ? "waiting" : stage === "missed" ? "no_show" : stage === "waiting" ? "waiting" : stage;
  const closedAt = rec.servedAt ?? rec.missedAt;
  const closedBy: ClosedBy | null = closedAt == null ? null : (overlay?.closedBy ?? (stage === "missed" ? "auto" : "staff"));
  return {
    id: rec.id, code: rec.code, number: rec.number, name: firstNameOf(name), serviceId: rec.serviceId, serviceName: found?.service.name ?? "Service",
    groupId: rec.groupId, origin: rec.source === "booking" ? "booking" : "app", live: true, priority: rec.priority, joinedAt: rec.joinedAt,
    orderAt: rec.joinedAt + rec.delayPositions * NOMINAL_STEP_MS, status, held: !!overlay?.held && stage === "serving",
    counter: stage === "waiting" || stage === "checkin" ? null : rec.counter, calledAt: rec.calledAt, arrivedAt: rec.servingStartedAt,
    replied: rec.onMyWayAt != null || rec.servingStartedAt != null, callDeadline: stage === "called" ? callDeadline(rec, ctx.policy) : null,
    confirming: stage === "checkin", note: overlay?.note ?? null, recalls: overlay?.recalls ?? 0, closedAt, closedBy, avgServiceMin: found?.service.avgServiceMin ?? 6,
  };
}

/** Everyone staff can see at the branch today, merged and not yet sorted. */
export function buildEntries(branch: Branch, now: EpochMs): QueueEntry[] {
  const today = dayKeyOf(branch, now);
  const f = loadFloor();
  const out: QueueEntry[] = [];

  for (const rec of Object.values(f.entries)) {
    if (rec.branchId !== branch.id) continue;
    const settled = settleEntry(rec, now);
    if (dayKeyOf(branch, settled.closedAt ?? settled.joinedAt) !== today) continue;
    out.push(toQueueEntry(settled));
  }

  const db = loadDb();
  for (const row of Object.values(db.tokens)) {
    if (row.branchId !== branch.id) continue;
    const terminal = row.servedAt != null || row.missedAt != null || row.leftAt != null;
    const rec = terminal ? row : reconcile(row, ctxFor(row), now).record;
    const stamp = rec.servedAt ?? rec.missedAt ?? rec.joinedAt;
    if (dayKeyOf(branch, stamp) !== today) continue;
    const entry = fromTokenRow(row, rec, now, db.users[row.userId]?.name ?? null, f.overlays[row.id]);
    if (entry) out.push(entry);
  }
  return out;
}

/* ----------------------------------------------------------------------- counters */

export function shiftToday(f: FloorDb, staffId: ID, dateKey: string): ShiftRow | null {
  const s = f.shifts[staffId];
  return s && s.dateKey === dateKey ? s : null;
}

export function counterOptions(branch: Branch, f: FloorDb, dateKey: string): CounterOption[] {
  return branch.counters.map((c) => {
    const holder = Object.entries(f.shifts).find(
      ([, s]) => s.branchId === branch.id && s.dateKey === dateKey && s.counter === c.number && (s.status === "open" || s.status === "break"),
    );
    const groupNames = c.groupIds.flatMap((gid) => groupOf(gid).services.map((s) => s.name));
    return {
      number: c.number,
      groupIds: c.groupIds,
      serviceNames: groupNames,
      takenBy: holder ? staffName(holder[0]) : null,
      onBreak: holder?.[1].status === "break",
    };
  });
}

