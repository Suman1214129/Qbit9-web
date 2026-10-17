/**
 * Glue between the pure queue rules in `@/domain` and the mock database.
 * Everything here stands in for work a backend does: assigning counters, keeping time, moving
 * tokens through their stages. Delete this folder's logic when `services/supabase` lands.
 */
import {
  DEFAULT_POLICY, deriveView, estimateWait, isActiveStage, reconcile, stageOf, tzParts,
  type Branch, type EpochMs, type ID, type TokenRecord, type TokenView,
} from "@/domain";
import type { QueueContext } from "@/domain";
import { clock } from "@/lib/clock";
import { ambientWaiting, countersFor, findService, getBranches } from "./catalogue";
import { loadDev, type MockDb, type MockTokenRow } from "./db";
import type { DevSettings } from "../types";

export const branchById = (id: ID, now: EpochMs = clock.now()): Branch | undefined => getBranches(now).find((b) => b.id === id);

export function paceFor(speed: DevSettings["speed"], avgServiceMin: number, counters: number) {
  const realistic = (avgServiceMin * 60_000) / Math.max(1, counters);
  if (speed === "realistic") return { stepMs: Math.round(realistic), arriveMs: 60_000, serviceMs: avgServiceMin * 60_000 };
  if (speed === "fast") return { stepMs: 6_000, arriveMs: 8_000, serviceMs: 20_000 };
  return { stepMs: 20_000, arriveMs: 15_000, serviceMs: 45_000 };
}

export function ctxFor(row: MockTokenRow): QueueContext {
  return {
    policy: DEFAULT_POLICY,
    timing: { stepMs: row.stepMs, arriveMs: row.arriveMs, serviceMs: row.serviceMs },
    counterFor: (r: TokenRecord) => {
      const branch = branchById(r.branchId);
      if (!branch) return null;
      const counters = countersFor(branch, r.groupId);
      return counters.length ? (counters[(r.number - 1) % counters.length] ?? null) : null;
    },
  };
}

export function dateKeyFor(branch: Branch, now: EpochMs): string {
  return tzParts(now, branch.timezone).dateKey;
}

/** Reconcile one row, store it back if anything beyond the bookkeeping timestamp changed. */
export function syncRow(db: MockDb, row: MockTokenRow, now: EpochMs): { row: MockTokenRow; changed: boolean } {
  const { record, events } = reconcile(row, ctxFor(row), now);
  const next: MockTokenRow = { ...row, ...record };
  const { reconciledAt: _a, ...before } = row;
  const { reconciledAt: _b, ...after } = next;
  const changed = events.length > 0 || JSON.stringify(before) !== JSON.stringify(after);
  if (changed) db.tokens[row.id] = next;
  return { row: changed ? next : row, changed };
}

/** Bring all of a user's tokens up to date. Returns true if anything was written. */
export function syncUserTokens(db: MockDb, userId: ID, now: EpochMs): boolean {
  let any = false;
  for (const row of Object.values(db.tokens)) {
    if (row.userId !== userId) continue;
    if (row.servedAt != null || row.missedAt != null || row.leftAt != null) continue;
    if (syncRow(db, row, now).changed) any = true;
  }
  return any;
}

export function userRows(db: MockDb, userId: ID): MockTokenRow[] {
  return Object.values(db.tokens).filter((r) => r.userId === userId);
}

export function isRowActive(row: MockTokenRow, now: EpochMs): boolean {
  return isActiveStage(stageOf(row, ctxFor(row), now));
}

export function viewOf(row: MockTokenRow, now: EpochMs): TokenView {
  const branch = branchById(row.branchId, now) as Branch;
  const found = findService(row.serviceId);
  const counters = Math.max(1, countersFor(branch, row.groupId).length);
  const avg = found?.service.avgServiceMin ?? 6;
  const usualWait = estimateWait(ambientWaiting(row.branchId, row.serviceId, now), avg, counters);
  return deriveView(row, ctxFor(row), now, {
    branchName: branch.name,
    branchSlug: branch.slug,
    bankName: branch.bank.name,
    bankSlug: branch.bank.slug,
    serviceName: found?.service.name ?? "Service",
    bring: found?.service.bring ?? [],
    avgServiceMin: avg,
    counters,
    usualWait,
  });
}

export const devSettings = () => loadDev();
