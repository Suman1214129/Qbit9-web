import { describe, expect, it } from "vitest";
import { buildHistory, groupByMonth, historyStats } from "./history";
import { makeToken, T0 } from "./fixtures";
import type { Booking } from "./types";

const DAY = 86_400_000;
const lookup = { branchName: () => "Main Road", serviceName: (id: string) => id, timezone: "Asia/Kolkata", savedMin: () => 10 };
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "bk_1", userId: "u", branchId: "b", serviceId: "svc_loan", startsAt: T0 + DAY, durationMin: 30,
  status: "upcoming", createdAt: T0, tokenId: null, ...over,
});

describe("buildHistory", () => {
  it("sorts newest first and maps statuses", () => {
    const items = buildHistory(
      [
        makeToken({ id: "a", joinedAt: T0 - 5 * DAY, calledAt: T0 - 5 * DAY + 10 * 60_000, servedAt: T0 - 5 * DAY + 20 * 60_000 }),
        makeToken({ id: "b", joinedAt: T0 - 2 * DAY, leftAt: T0 - 2 * DAY + 1000 }),
        makeToken({ id: "c", joinedAt: T0 - 1 * DAY, missedAt: T0 - 1 * DAY + 1000 }),
      ],
      [booking()],
      lookup,
    );
    expect(items.map((i) => i.refId)).toEqual(["bk_1", "c", "b", "a"]);
    expect(items.map((i) => i.status)).toEqual(["upcoming", "missed", "left", "served"]);
    expect(items[3]?.waitedMin).toBe(10);
  });
  it("shows a booking that became a token once", () => {
    const items = buildHistory([makeToken({ id: "t9", bookingId: "bk_1" })], [booking({ tokenId: "t9", status: "checked_in" })], lookup);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("token");
  });
  it("labels cancelled bookings", () => {
    expect(buildHistory([], [booking({ status: "cancelled" })], lookup)[0]?.status).toBe("cancelled");
  });
});

describe("historyStats", () => {
  it("averages waits and sums saved time over served visits only", () => {
    const items = buildHistory(
      [
        makeToken({ id: "a", joinedAt: T0 - 5 * DAY, calledAt: T0 - 5 * DAY + 10 * 60_000, servedAt: T0 - 5 * DAY + 20 * 60_000 }),
        makeToken({ id: "b", joinedAt: T0 - 4 * DAY, calledAt: T0 - 4 * DAY + 20 * 60_000, servedAt: T0 - 4 * DAY + 30 * 60_000 }),
        makeToken({ id: "c", joinedAt: T0 - 3 * DAY, leftAt: T0 - 3 * DAY + 1000 }),
      ],
      [],
      lookup,
    );
    expect(historyStats(items)).toEqual({ visits: 2, averageWaitMin: 15, savedMin: 20 });
  });
  it("handles an empty history", () => {
    expect(historyStats([])).toEqual({ visits: 0, averageWaitMin: null, savedMin: 0 });
  });
});

describe("groupByMonth", () => {
  it("groups by branch-local month in order", () => {
    const items = buildHistory(
      [makeToken({ id: "a", joinedAt: Date.UTC(2026, 8, 20) }), makeToken({ id: "b", joinedAt: Date.UTC(2026, 9, 5) }), makeToken({ id: "c", joinedAt: Date.UTC(2026, 9, 6) })],
      [],
      lookup,
    );
    const groups = groupByMonth(items, "Asia/Kolkata");
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([["October", 2], ["September", 1]]);
  });
});
