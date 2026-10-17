import { DomainError, openStatus, waitMid, formatClock, hoursForDate, tzParts, type Branch, type BranchSnapshot, type ID } from "@/domain";
import { clock } from "@/lib/clock";
import { env } from "@/lib/env";
import type { BranchService } from "../types";
import { getBranches, liveCatalogue } from "./catalogue";
import { devSettings } from "./engine";

/** Whether a branch accepts walk-in tokens right now. Mock flags can force it open or closed. */
export function isBranchOpen(branch: Branch, now: number): boolean {
  if (devSettings().forceClosed) return false;
  if (env.mockAlwaysOpen) return true;
  return openStatus(branch, now).isOpen;
}

export function snapshotOf(branch: Branch, now: number): BranchSnapshot {
  const open = isBranchOpen(branch, now);
  const os = openStatus(branch, now);
  const catalogue = liveCatalogue(branch, now, !open);
  const services = catalogue.flatMap((g) => g.services);
  const waitingTotal = services.reduce((n, s) => n + s.waiting, 0);
  const weighted = services.reduce((sum, s) => sum + waitMid(s.usualWait) * s.waiting, 0);
  const todays = hoursForDate(branch, tzParts(now, branch.timezone).dateKey);
  return {
    branchId: branch.id,
    waitingTotal,
    usualWaitMin: waitingTotal ? Math.round(weighted / waitingTotal / 5) * 5 : 0,
    isOpen: open,
    closesLabel: open ? (os.closesLabel ?? (todays ? formatClock(todays.closesAt, branch.timezone) : null)) : null,
    opensLabel: open ? null : (os.opensLabel ?? null),
    updatedAt: now,
  };
}

export function createBranchService(): BranchService {
  const need = (id: ID, now: number) => {
    const b = getBranches(now).find((x) => x.id === id);
    if (!b) throw new DomainError("branch_not_found");
    return b;
  };
  return {
    async list() {
      return getBranches(clock.now());
    },
    async bySlug(bankSlug, branchSlug) {
      return getBranches(clock.now()).find((b) => b.bank.slug === bankSlug && b.slug === branchSlug) ?? null;
    },
    async byId(id) {
      return getBranches(clock.now()).find((b) => b.id === id) ?? null;
    },
    async snapshot(id) {
      const now = clock.now();
      return snapshotOf(need(id, now), now);
    },
    async snapshots(ids) {
      const now = clock.now();
      return Object.fromEntries(ids.map((id) => [id, snapshotOf(need(id, now), now)]));
    },
    async catalogue(id) {
      const now = clock.now();
      const branch = need(id, now);
      return liveCatalogue(branch, now, !isBranchOpen(branch, now));
    },
  };
}
