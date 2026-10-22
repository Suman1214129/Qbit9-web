import { onKeyChange, readJson, removeKey, writeJson } from "@/lib/storage";
import type { ClosedBy, DaySummary, EntryRecord, EpochMs, ID, PinAttempts, ShiftState } from "@/domain";
import { STAFF_ACCOUNTS } from "./accounts";

export const FLOOR_KEY = "qbit9.mock.staff.v1";

/** What staff know about an app token beyond what the token itself stores. */
export interface TokenOverlay {
  note: string | null;
  held: boolean;
  recalls: number;
  closedBy: ClosedBy | null;
}

export interface ShiftRow extends ShiftState {
  /** Branch-local date this shift belongs to. A new day starts a fresh shift. */
  dateKey: string;
  branchId: ID;
}

/** What a simulated customer does once called. Mock only: real customers do this themselves. */
export interface SimBehaviour {
  replyAfterMs: number;
  arriveAfterMs: number;
  noReply: boolean;
}

/** A counter entry in the mock. Simulated customers carry `sim`; walk-ins and history have null. */
export type MockEntryRecord = EntryRecord & { sim: SimBehaviour | null };

export interface FloorDb {
  session: { staffId: ID; expiresAt: EpochMs } | null;
  attempts: Record<string, PinAttempts>;
  shifts: Record<ID, ShiftRow>;
  /** Simulated customers, counter walk-ins and earlier visits. App tokens live in the customer db. */
  entries: Record<ID, MockEntryRecord>;
  overlays: Record<ID, TokenOverlay>;
  /** `${branchId}|${dateKey}` of days already given their opening queue. */
  seeded: Record<string, true>;
  /** Last simulated arrival per `${branchId}|${dateKey}|${groupId}`. */
  lastArrival: Record<string, EpochMs>;
  /** Next lower token number for earlier visits, per `${branchId}|${dateKey}|${groupId}`. */
  histNext: Record<string, number>;
  lastShift: Record<ID, DaySummary & { endedAt: EpochMs }>;
}

export const emptyFloor = (): FloorDb => ({
  session: null, attempts: {}, shifts: {}, entries: {}, overlays: {}, seeded: {}, lastArrival: {}, histNext: {}, lastShift: {},
});

export const loadFloor = (): FloorDb => ({ ...emptyFloor(), ...readJson<Partial<FloorDb>>(FLOOR_KEY, {}) });
export const saveFloor = (f: FloorDb): void => writeJson(FLOOR_KEY, f);

/** Read, change, write. Saved even when `fn` throws so counters like PIN attempts persist. */
export function mutateFloor<T>(fn: (f: FloorDb) => T): T {
  const f = loadFloor();
  const before = JSON.stringify(f);
  try {
    return fn(f);
  } finally {
    // Reads call this too (ensureFloor). Writing unchanged data would fire the change event, which
    // makes the screens refetch, which reads again: an endless loop. Only save real changes.
    if (JSON.stringify(f) !== before) saveFloor(f);
  }
}

export const resetFloor = (): void => removeKey(FLOOR_KEY);
export const onFloorChange = (fn: () => void) => onKeyChange(FLOOR_KEY, fn);

/**
 * Counters whose staff are on a break right now. The customer mock reads this so wait estimates
 * rise while a counter is away. A counter nobody has opened counts as open: with no staff app in
 * use the customer demo behaves exactly as before.
 */
export function counterNumbersOnBreak(branchId: ID): number[] {
  const f = readJson<Partial<FloorDb>>(FLOOR_KEY, {});
  const out: number[] = [];
  for (const s of Object.values(f.shifts ?? {})) {
    if (s.branchId === branchId && s.status === "break" && s.counter != null) out.push(s.counter);
  }
  return out;
}

export const staffName = (id: ID): string | null => STAFF_ACCOUNTS.find((a) => a.id === id)?.name ?? null;
