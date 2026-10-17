import { DEFAULT_POLICY } from "./policy";
import type { QueueContext } from "./queue";
import type { TokenRecord } from "./types";

/** Test helpers. Kept beside the domain so services tests can reuse them. */
export const T0 = Date.UTC(2026, 9, 16, 5, 0, 0); // 10:30 IST on Fri 16 Oct 2026

export const testCtx = (over: Partial<QueueContext["timing"]> = {}): QueueContext => ({
  policy: DEFAULT_POLICY,
  timing: { stepMs: 60_000, arriveMs: 20_000, serviceMs: 120_000, ...over },
  counterFor: () => 4,
});

export function makeToken(over: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: "tok_1",
    code: "C-047",
    number: 47,
    branchId: "br_main",
    serviceId: "svc_cash",
    groupId: "grp_cash",
    userId: "usr_1",
    source: "walk_in",
    priority: [],
    joinedAt: T0,
    aheadAtJoin: 8,
    delayPositions: 0,
    lapseCount: 0,
    checkinPromptedAt: null,
    checkinConfirmedAt: null,
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
    reconciledAt: T0,
    bookingId: null,
    ...over,
  } as TokenRecord;
}
