/**
 * The real queue, for the mock.
 *
 * While a staff counter is open at a branch, customers' places come from the same list staff work
 * through: the line moves when staff call people, not on a timer. This builds that view from the two
 * mock stores without reconciling anything (reconcile asks this module for "ahead", so it must not
 * call back into it).
 *
 * With nobody on a counter the customer app falls back to its own simulation, so it still works
 * alone. A real backend always has this: it is one query over the tokens table.
 */
import { compareQueueOrder, tzParts, type Branch, type EpochMs, type ID, type LiveQueue, type TokenRecord } from "@/domain";
import { readRaw } from "@/lib/storage";
import { DB_KEY, loadDb } from "../db";
import { FLOOR_KEY, loadFloor } from "./store";

/** How much one position of setback is worth when ordering tokens against counter entries. */
export const NOMINAL_STEP_MS = 90_000;
/** A token staff called must never be auto-finished by the customer simulation. */
export const STAFF_SERVICE_MS = 12 * 3_600_000;

interface Item {
  id: ID;
  code: string;
  groupId: ID;
  serviceId: ID;
  number: number;
  hasPriority: boolean;
  orderAt: EpochMs;
  calledAt: EpochMs | null;
  waiting: boolean;
}

interface Snapshot {
  staffed: boolean;
  items: Item[];
}

let cache: { key: string; value: Snapshot } | null = null;

function snapshot(branch: Pick<Branch, "id" | "timezone">, now: EpochMs): Snapshot {
  const today = tzParts(now, branch.timezone).dateKey;
  const key = `${branch.id}|${today}|${readRaw(DB_KEY)}|${readRaw(FLOOR_KEY)}`;
  if (cache?.key === key) return cache.value;

  const f = loadFloor();
  const staffed = Object.values(f.shifts).some((s) => s.branchId === branch.id && s.dateKey === today && (s.status === "open" || s.status === "break"));
  const items: Item[] = [];
  if (staffed) {
    const dayOf = (ts: EpochMs) => tzParts(ts, branch.timezone).dateKey;
    for (const e of Object.values(f.entries)) {
      if (e.branchId !== branch.id || dayOf(e.joinedAt) !== today || e.closeKind) continue;
      items.push({
        id: e.id, code: e.code, groupId: e.groupId, serviceId: e.serviceId, number: e.number, hasPriority: e.priority.length > 0,
        orderAt: e.orderAt, calledAt: e.calledAt, waiting: e.calledAt == null,
      });
    }
    for (const t of Object.values(loadDb().tokens)) {
      if (t.branchId !== branch.id || t.leftAt != null || t.servedAt != null || t.missedAt != null || dayOf(t.joinedAt) !== today) continue;
      items.push({
        id: t.id, code: t.code, groupId: t.groupId, serviceId: t.serviceId, number: t.number, hasPriority: t.priority.length > 0,
        orderAt: t.joinedAt + t.delayPositions * NOMINAL_STEP_MS, calledAt: t.calledAt, waiting: t.calledAt == null,
      });
    }
  }
  const value = { staffed, items };
  cache = { key, value };
  return value;
}

/** People waiting in a service group's queue, or null when the branch is not staffed. */
export function waitingInGroup(branch: Pick<Branch, "id" | "timezone">, groupId: ID, now: EpochMs): number | null {
  const s = snapshot(branch, now);
  return s.staffed ? s.items.filter((i) => i.waiting && i.groupId === groupId).length : null;
}

/** The queue as the customer app should see it, or undefined when it should simulate its own. */
export function liveQueueFor(branch: Pick<Branch, "id" | "timezone">, now: EpochMs): LiveQueue | undefined {
  if (!snapshot(branch, now).staffed) return undefined;
  const view = () => snapshot(branch, now).items;
  return {
    ahead: (r: TokenRecord) => {
      const me = { hasPriority: r.priority.length > 0, orderAt: r.joinedAt + r.delayPositions * NOMINAL_STEP_MS, number: r.number };
      return view().filter((i) => i.waiting && i.groupId === r.groupId && i.id !== r.id && compareQueueOrder(i, me) < 0).length;
    },
    nowServing: (r: TokenRecord) => {
      let best: Item | null = null;
      for (const i of view()) if (i.groupId === r.groupId && i.calledAt != null && (!best || (i.calledAt > (best.calledAt as number)))) best = i;
      return best?.code ?? null;
    },
  };
}
