import { describe, expect, it } from "vitest";
import { aheadForNewToken, estimateWait, savedMs, waitMid } from "./wait";

describe("estimateWait", () => {
  it("is zero with nobody ahead", () => {
    expect(estimateWait(0, 6, 2)).toEqual({ minMin: 0, maxMin: 0 });
  });
  it("gives a range, never a single number", () => {
    const w = estimateWait(3, 6, 2);
    expect(w.maxMin).toBeGreaterThan(w.minMin);
    expect(w).toEqual({ minMin: 8, maxMin: 12 });
  });
  it("grows with the line", () => {
    expect(waitMid(estimateWait(10, 6, 2))).toBeGreaterThan(waitMid(estimateWait(5, 6, 2)));
  });
  it("shrinks with more counters", () => {
    expect(waitMid(estimateWait(8, 6, 4))).toBeLessThan(waitMid(estimateWait(8, 6, 2)));
  });
  it("always shows at least a one minute spread when someone is ahead", () => {
    const w = estimateWait(1, 1, 5);
    expect(w.minMin).toBeGreaterThanOrEqual(1);
    expect(w.maxMin).toBeGreaterThan(w.minMin);
  });
  it("treats zero counters as one", () => {
    expect(estimateWait(2, 6, 0)).toEqual(estimateWait(2, 6, 1));
  });
});

describe("aheadForNewToken", () => {
  it("is the whole line for a normal walk-in", () => {
    expect(aheadForNewToken(7, { priority: [], source: "walk_in" })).toBe(7);
  });
  it("lets priority customers jump most of the line", () => {
    expect(aheadForNewToken(10, { priority: ["senior_citizen"], source: "walk_in" })).toBe(2);
  });
  it("keeps priority customers behind at least one when the line is not empty", () => {
    expect(aheadForNewToken(2, { priority: ["disability"], source: "walk_in" })).toBe(1);
  });
  it("is zero for an empty line", () => {
    expect(aheadForNewToken(0, { priority: ["pensioner"], source: "walk_in" })).toBe(0);
  });
  it("caps booked tokens", () => {
    expect(aheadForNewToken(9, { priority: [], source: "booking" })).toBe(2);
    expect(aheadForNewToken(1, { priority: [], source: "booking" })).toBe(1);
  });
});

describe("savedMs", () => {
  it("is the time before the check-in prompt", () => {
    expect(savedMs(1000, 61_000, null)).toBe(60_000);
  });
  it("never goes negative", () => {
    expect(savedMs(5000, 1000, null)).toBe(0);
  });
  it("falls back to the call time", () => {
    expect(savedMs(0, null, 30_000)).toBe(30_000);
    expect(savedMs(0, null, null)).toBe(0);
  });
});
