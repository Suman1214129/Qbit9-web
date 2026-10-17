import { type TokenRecord, type User } from "@/domain";
import { ambientWaiting, findService, getBranches } from "./catalogue";
import { paceFor } from "./engine";
import type { MockDb, MockTokenRow } from "./db";

const DAY = 86_400_000;
const MIN = 60_000;

/** A handful of past visits so History and its stats are not empty for a brand new mock user. */
export function seedHistory(db: MockDb, user: User, now: number): void {
  const branches = getBranches(now);
  const plan: Array<{ daysAgo: number; branch: string; service: string; number: number; waitMin: number; outcome: "served" | "left" }> = [
    { daysAgo: 3, branch: "br_sbi_ring_road", service: "svc_passbook", number: 12, waitMin: 5, outcome: "served" },
    { daysAgo: 9, branch: "br_sbi_main_road", service: "svc_cash", number: 58, waitMin: 17, outcome: "served" },
    { daysAgo: 16, branch: "br_sbi_main_road", service: "svc_kyc", number: 31, waitMin: 12, outcome: "served" },
    { daysAgo: 24, branch: "br_sbi_station_road", service: "svc_cheque", number: 44, waitMin: 0, outcome: "left" },
    { daysAgo: 37, branch: "br_sbi_main_road", service: "svc_dd", number: 22, waitMin: 9, outcome: "served" },
  ];

  plan.forEach((p, i) => {
    const branch = branches.find((b) => b.id === p.branch);
    const found = findService(p.service);
    if (!branch || !found) return;
    const joinedAt = now - p.daysAgo * DAY - (2 + i) * 3_600_000;
    const pace = paceFor("demo", found.service.avgServiceMin, 2);
    const base: MockTokenRow = {
      id: `tok_seed_${user.id}_${i}`,
      code: `${found.group.tokenPrefix}-${String(p.number).padStart(3, "0")}`,
      number: p.number,
      branchId: branch.id,
      serviceId: found.service.id,
      groupId: found.group.id,
      userId: user.id,
      source: "walk_in",
      priority: [],
      joinedAt,
      aheadAtJoin: Math.max(0, ambientWaiting(branch.id, found.service.id, joinedAt)),
      delayPositions: 0,
      lapseCount: 0,
      checkinPromptedAt: joinedAt,
      checkinConfirmedAt: joinedAt,
      calledAt: null,
      counter: null,
      onMyWayAt: null,
      extraTimeMs: 0,
      extensionCount: 0,
      servingStartedAt: null,
      servedAt: null,
      missedAt: null,
      leftAt: null,
      feedback: null,
      reconciledAt: joinedAt + 60 * MIN,
      bookingId: null,
      ...pace,
    };
    if (p.outcome === "served") {
      base.calledAt = joinedAt + p.waitMin * MIN;
      base.counter = 4;
      base.onMyWayAt = base.calledAt + MIN;
      base.servingStartedAt = base.calledAt + 2 * MIN;
      base.servedAt = base.servingStartedAt + found.service.avgServiceMin * MIN;
      base.feedback = i % 2 === 0 ? "quick" : "okay";
    } else {
      base.leftAt = joinedAt + 4 * MIN;
    }
    db.tokens[base.id] = base;
  });
}

export type { TokenRecord };
