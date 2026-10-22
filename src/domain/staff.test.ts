import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { makeToken, T0, testCtx } from "./fixtures";
import {
  STAFF_POLICY, breakImpactMin, callEntry, callToken, closeEntry, compareEntries, currentAt, entryStatus, holdEntry, markTokenNoShow,
  nudgeAfterMs, pickNext, pinLockRemainingMs, recallEntry, recallToken, registerWrongPin, reopenEntry, reopenToken, shouldNudge,
  sortEntries, summarizeDay, transferEntry, transferToken, validateEmployeeId, validateNote, validatePin,
  type EntryRecord, type QueueEntry,
} from "./staff";
import { stageOf } from "./queue";

const MIN = 60_000;
const ctx = testCtx();
const at = (m: number) => T0 + m * MIN;

function entry(over: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: "e1", code: "C-048", number: 48, name: null, serviceId: "svc_cash", serviceName: "Cash deposit", groupId: "grp_cash",
    origin: "app", live: false, priority: [], joinedAt: T0, orderAt: T0, status: "waiting", held: false, counter: null,
    calledAt: null, arrivedAt: null, replied: false, callDeadline: null, confirming: false, note: null, recalls: 0,
    closedAt: null, closedBy: null, avgServiceMin: 4, ...over,
  };
}

function record(over: Partial<EntryRecord> = {}): EntryRecord {
  return {
    id: "n1", code: "C-049", number: 49, branchId: "br_main", serviceId: "svc_cash", groupId: "grp_cash", name: "Ramesh", phone: null,
    origin: "counter", priority: [], joinedAt: T0, orderAt: T0, calledAt: null, counter: null, arrivedAt: null, repliedAt: null,
    closedAt: null, closeKind: null, closedBy: null, held: false, note: null, recalls: 0, ...over,
  };
}

describe("sign in validation", () => {
  it("normalises the employee id", () => {
    expect(validateEmployeeId(" e48213 ")).toEqual({ ok: true, value: "E48213" });
    expect(validateEmployeeId("48213").ok).toBe(false);
    expect(validateEmployeeId("E4821").ok).toBe(false);
  });
  it("accepts 4 to 6 digit PINs only", () => {
    expect(validatePin("4821").ok).toBe(true);
    expect(validatePin("482193").ok).toBe(true);
    expect(validatePin("482").ok).toBe(false);
    expect(validatePin("4821937").ok).toBe(false);
    expect(validatePin("48a1").ok).toBe(false);
  });
  it("locks after five wrong PINs and unlocks later", () => {
    let a = registerWrongPin(undefined, at(0));
    for (let i = 1; i < STAFF_POLICY.maxPinAttempts - 1; i++) a = registerWrongPin(a, at(0));
    expect(pinLockRemainingMs(a, at(0))).toBe(0);
    a = registerWrongPin(a, at(0));
    expect(pinLockRemainingMs(a, at(0))).toBe(STAFF_POLICY.lockoutMs);
    expect(pinLockRemainingMs(a, at(0) + STAFF_POLICY.lockoutMs)).toBe(0);
    expect(registerWrongPin(a, at(10)).count).toBe(1);
  });
  it("limits note length and treats blank as none", () => {
    expect(validateNote("   ")).toEqual({ ok: true, value: null });
    expect(validateNote("x".repeat(STAFF_POLICY.noteMaxLength + 1)).ok).toBe(false);
  });
});

describe("queue order", () => {
  it("puts priority first, then arrival", () => {
    const a = entry({ id: "a", number: 48, orderAt: at(0) });
    const b = entry({ id: "b", number: 49, orderAt: at(1) });
    const p = entry({ id: "p", number: 51, orderAt: at(5), priority: ["senior_citizen"] });
    expect(sortEntries([b, a, p]).map((e) => e.id)).toEqual(["p", "a", "b"]);
  });
  it("breaks ties by token number", () => {
    expect(compareEntries(entry({ number: 3 }), entry({ number: 5 }))).toBeLessThan(0);
  });
  it("picks the first callable entry for the counter's groups and skips those still confirming", () => {
    const confirming = entry({ id: "c", orderAt: at(0), confirming: true });
    const ok = entry({ id: "ok", orderAt: at(1) });
    const other = entry({ id: "loan", orderAt: at(0), groupId: "grp_loans" });
    expect(pickNext([confirming, ok, other], ["grp_cash"])?.id).toBe("ok");
    expect(pickNext([confirming], ["grp_cash"])).toBeNull();
    expect(pickNext([other], ["grp_cash"])).toBeNull();
  });
  it("finds who is at a counter and ignores held customers", () => {
    const serving = entry({ id: "s", status: "serving", counter: 4, calledAt: at(1), arrivedAt: at(2) });
    const held = entry({ id: "h", status: "serving", counter: 4, calledAt: at(0), arrivedAt: at(0), held: true });
    expect(currentAt([held, serving], 4)?.id).toBe("s");
    expect(currentAt([held], 4)).toBeNull();
    expect(currentAt([serving], 5)).toBeNull();
  });
});

describe("still serving nudge", () => {
  const serving = entry({ status: "serving", counter: 4, calledAt: at(0), arrivedAt: at(0), avgServiceMin: 4 });
  it("waits for twice the usual time, never under the minimum", () => {
    expect(nudgeAfterMs(4)).toBe(8 * MIN);
    expect(nudgeAfterMs(2)).toBe(STAFF_POLICY.nudgeMinMs);
    expect(nudgeAfterMs(10)).toBe(20 * MIN);
  });
  it("only prompts when something looks off", () => {
    expect(shouldNudge(serving, at(7), null)).toBe(false);
    expect(shouldNudge(serving, at(8), null)).toBe(true);
  });
  it("respects the snooze, holds and the called state", () => {
    expect(shouldNudge(serving, at(9), at(12))).toBe(false);
    expect(shouldNudge(serving, at(12), at(12))).toBe(true);
    expect(shouldNudge({ ...serving, held: true }, at(30), null)).toBe(false);
    expect(shouldNudge({ ...serving, status: "called", arrivedAt: null }, at(30), null)).toBe(false);
    expect(shouldNudge(null, at(30), null)).toBe(false);
  });
});

describe("break impact", () => {
  it("is zero when nothing changes and grows as counters go away", () => {
    expect(breakImpactMin(10, 6, 2, 2)).toBe(0);
    expect(breakImpactMin(10, 6, 2, 1)).toBeGreaterThan(0);
    expect(breakImpactMin(0, 6, 2, 1)).toBe(0);
  });
});

describe("staff actions on an app token", () => {
  const waiting = makeToken({ aheadAtJoin: 8 });

  it("calls a waiting token to the counter and starts its window", () => {
    const { record: r, events } = callToken(waiting, ctx, at(1), 4);
    expect(r.calledAt).toBe(at(1));
    expect(r.counter).toBe(4);
    expect(r.checkinConfirmedAt).toBe(at(1));
    expect(stageOf(r, ctx, at(1))).toBe("called");
    expect(events.some((e) => e.type === "called")).toBe(true);
  });
  it("will not call someone who must still confirm they are here", () => {
    const nearby = makeToken({ aheadAtJoin: 8 });
    expect(() => callToken(nearby, ctx, at(6), 4)).toThrowError(DomainError);
    try {
      callToken(nearby, ctx, at(6), 4);
    } catch (e) {
      expect((e as DomainError).code).toBe("entry_not_callable");
    }
  });
  it("will not call a token twice", () => {
    const { record } = callToken(waiting, ctx, at(1), 4);
    expect(() => callToken(record, ctx, at(2), 4)).toThrowError(DomainError);
  });
  it("recalls with a fresh full window and enforces the limit", () => {
    const { record: called } = callToken(waiting, ctx, at(1), 4);
    const { record: r } = recallToken(called, ctx, at(4), 0);
    expect(r.calledAt! + ctx.policy.calledWindowMs + r.extraTimeMs).toBe(at(4) + ctx.policy.calledWindowMs);
    expect(stageOf(r, ctx, at(8))).toBe("called");
    expect(() => recallToken(called, ctx, at(4), STAFF_POLICY.maxRecalls)).toThrowError(DomainError);
  });
  it("keeps a customer's own extension if it is longer than the recall", () => {
    const { record: called } = callToken(waiting, ctx, at(1), 4);
    const extended = { ...called, extraTimeMs: 10 * MIN };
    expect(recallToken(extended, ctx, at(2), 0).record.extraTimeMs).toBe(10 * MIN);
  });
  it("marks a called customer who never came as missed, and undo calls them again", () => {
    const { record: called } = callToken(waiting, ctx, at(1), 4);
    const { record: missed } = markTokenNoShow(called, ctx, at(3));
    expect(stageOf(missed, ctx, at(3))).toBe("missed");
    const back = reopenToken(missed, at(4), 4);
    expect(back.missedAt).toBeNull();
    expect(back.calledAt).toBe(at(4));
    expect(stageOf(back, ctx, at(4))).toBe("called");
  });
  it("cannot reopen a token that was served", () => {
    expect(() => reopenToken(makeToken({ servedAt: at(5), missedAt: null }), at(6), 4)).toThrowError(DomainError);
  });
  it("transfers to another counter and calls the customer there", () => {
    const { record: called } = callToken(waiting, ctx, at(1), 4);
    const { record: r } = transferToken(called, ctx, at(2), 5);
    expect(r.counter).toBe(5);
    expect(r.calledAt).toBe(at(2));
    expect(r.onMyWayAt).toBeNull();
    expect(() => transferToken(waiting, ctx, at(2), 5)).toThrowError(DomainError);
  });
});

describe("the same rules on a counter entry", () => {
  it("moves waiting to called to serving to served", () => {
    let r = record();
    expect(entryStatus(r)).toBe("waiting");
    r = callEntry(r, at(1), 4);
    expect(entryStatus(r)).toBe("called");
    r = { ...r, arrivedAt: at(2) };
    expect(entryStatus(r)).toBe("serving");
    r = closeEntry(r, "served", at(6), "staff");
    expect(entryStatus(r)).toBe("served");
    expect(r.closedBy).toBe("staff");
  });
  it("rejects impossible moves", () => {
    expect(() => closeEntry(record(), "served", at(1), "staff")).toThrowError(DomainError);
    expect(() => closeEntry(record(), "no_show", at(1), "staff")).toThrowError(DomainError);
    expect(() => callEntry(callEntry(record(), at(1), 4), at(2), 4)).toThrowError(DomainError);
    expect(() => holdEntry(callEntry(record(), at(1), 4))).toThrowError(DomainError);
  });
  it("recalls up to the limit and resets the call time", () => {
    let r = callEntry(record(), at(1), 4);
    r = recallEntry(r, at(3));
    expect(r.calledAt).toBe(at(3));
    r = recallEntry(r, at(4));
    expect(() => recallEntry(r, at(5))).toThrowError(DomainError);
  });
  it("undoes a no-show by calling the customer again", () => {
    const called = callEntry(record(), at(1), 4);
    const missed = closeEntry(called, "no_show", at(7), "auto");
    expect(missed.closedBy).toBe("auto");
    const back = reopenEntry(missed, at(8), 4);
    expect(entryStatus(back)).toBe("called");
    expect(back.closedAt).toBeNull();
    expect(() => reopenEntry(back, at(9), 4)).toThrowError(DomainError);
  });
  it("transfers and clears the hold", () => {
    const serving = { ...callEntry(record(), at(1), 4), arrivedAt: at(2) };
    const held = holdEntry(serving);
    expect(held.held).toBe(true);
    const moved = transferEntry(held, at(3), 5);
    expect(moved.counter).toBe(5);
    expect(moved.held).toBe(false);
    expect(entryStatus(moved)).toBe("called");
  });
});

describe("the day", () => {
  const tz = "Asia/Kolkata";
  const served = (id: string, arrived: number, closed: number) => entry({ id, status: "served", arrivedAt: at(arrived), closedAt: at(closed) });

  it("averages time at the counter and counts no-shows", () => {
    const s = summarizeDay([served("a", 0, 4), served("b", 5, 11), entry({ id: "n", status: "no_show", closedAt: at(12) })], at(20), tz);
    expect(s.served).toBe(2);
    expect(s.noShows).toBe(1);
    expect(s.avgServiceMs).toBe(5 * MIN);
  });
  it("has no average before the first visit", () => {
    const s = summarizeDay([], at(20), tz);
    expect(s.avgServiceMs).toBeNull();
    expect(s.served).toBe(0);
  });
  it("lists every hour from the first visit to now, including quiet ones", () => {
    // T0 is 10:30 IST. Close one at 10:35 and another at 12:40, now is 13:00.
    const s = summarizeDay([served("a", 0, 5), served("b", 100, 130)], at(150), tz);
    expect(s.hourly.map((h) => h.hour)).toEqual([10, 11, 12, 13]);
    expect(s.hourly.map((h) => h.count)).toEqual([1, 0, 1, 0]);
  });
});
