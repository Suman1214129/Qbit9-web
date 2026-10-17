import { describe, expect, it } from "vitest";
import {
  aheadAt, confirmCheckin, deriveView, finishServing, leaveQueue, markOnMyWay, moveBack, nearArrivesAt,
  reconcile, requestMoreTime, stageOf, startServing, turnArrivesAt, type ViewInfo,
} from "./queue";
import { DomainError } from "./errors";
import { makeToken, T0, testCtx } from "./fixtures";

const MIN = 60_000;
const ctx = testCtx(); // one position per minute
const info: ViewInfo = {
  branchName: "Main Road Branch", branchSlug: "main-road", bankName: "State Bank of India", bankSlug: "sbi", serviceName: "Cash deposit or withdrawal",
  bring: ["Passbook"], avgServiceMin: 6, counters: 2, usualWait: { minMin: 15, maxMin: 25 },
};
const at = (m: number) => T0 + m * MIN;

describe("positions over time", () => {
  it("counts down one position per step", () => {
    const t = makeToken({ aheadAtJoin: 8 });
    expect(aheadAt(t, ctx.timing, at(0))).toBe(8);
    expect(aheadAt(t, ctx.timing, at(3))).toBe(5);
    expect(aheadAt(t, ctx.timing, at(3) + 59_000)).toBe(5);
    expect(aheadAt(t, ctx.timing, at(8))).toBe(0);
    expect(aheadAt(t, ctx.timing, at(30))).toBe(0);
  });
  it("includes setbacks", () => {
    expect(aheadAt(makeToken({ aheadAtJoin: 4, delayPositions: 3 }), ctx.timing, at(2))).toBe(5);
  });
  it("never goes below zero or negative before joining", () => {
    expect(aheadAt(makeToken(), ctx.timing, T0 - 10 * MIN)).toBe(8);
  });
  it("computes when the prompt and the turn arrive", () => {
    const t = makeToken({ aheadAtJoin: 8 });
    expect(nearArrivesAt(t, ctx)).toBe(at(5));
    expect(turnArrivesAt(t, ctx.timing)).toBe(at(8));
  });
});

describe("check-in flow", () => {
  it("stays waiting until three are ahead", () => {
    const { record, events } = reconcile(makeToken(), ctx, at(4));
    expect(stageOf(record, ctx, at(4))).toBe("waiting");
    expect(events).toEqual([]);
  });
  it("opens the check-in prompt at three ahead and tells us once", () => {
    const first = reconcile(makeToken(), ctx, at(5) + 1000);
    expect(stageOf(first.record, ctx, at(5) + 1000)).toBe("checkin");
    expect(first.events.map((e) => e.type)).toEqual(["nearby"]);
    const second = reconcile(first.record, ctx, at(5) + 2000);
    expect(second.events).toEqual([]);
  });
  it("is idempotent at the same instant", () => {
    const a = reconcile(makeToken(), ctx, at(6));
    const b = reconcile(a.record, ctx, at(6));
    expect(b.record).toEqual(a.record);
    expect(b.events).toEqual([]);
  });
  it("confirming keeps the place and leads to a call", () => {
    const r1 = reconcile(makeToken(), ctx, at(5) + 1000).record;
    const confirmed = confirmCheckin(r1, ctx, at(5) + 5000).record;
    expect(confirmed.checkinConfirmedAt).toBe(at(5) + 5000);
    const later = reconcile(confirmed, ctx, at(8) + 1000);
    expect(stageOf(later.record, ctx, at(8) + 1000)).toBe("called");
    expect(later.record.calledAt).toBe(at(8));
    expect(later.record.counter).toBe(4);
    expect(later.events.map((e) => e.type)).toEqual(["called"]);
  });
  it("moves the token back when the prompt expires unconfirmed", () => {
    // prompt at 5 min, window 3 min, but the turn arrives at 8 min: both end at 8
    const t = makeToken({ aheadAtJoin: 10 }); // prompt at 7, window ends 10, turn at 10
    const res = reconcile(t, ctx, at(10) + 1000);
    expect(res.record.lapseCount).toBe(1);
    expect(res.record.delayPositions).toBe(3);
    // After the setback only three are ahead again, so a fresh prompt opens straight away.
    expect(res.events.map((e) => e.type)).toEqual(["nearby", "checkin_lapsed", "nearby"]);
    expect(res.record.calledAt).toBeNull();
    expect(aheadAt(res.record, ctx.timing, at(10) + 1000)).toBe(3);
    expect(stageOf(res.record, ctx, at(10) + 1000)).toBe("checkin");
  });
  it("never calls a customer who has not confirmed: the turn arriving ends the prompt early", () => {
    const t = makeToken({ aheadAtJoin: 5 }); // prompt at 2, turn at 5, window would end at 5 too
    const slow = testCtx({ stepMs: 30_000 }); // turn at 2.5 min, prompt at 1 min, window would end 4 min
    const res = reconcile(t, slow, T0 + 3 * MIN);
    expect(res.record.lapseCount).toBeGreaterThanOrEqual(1);
    expect(res.record.calledAt).toBeNull();
  });
  it("re-prompts after a setback", () => {
    const res = reconcile(makeToken({ aheadAtJoin: 10 }), ctx, at(14));
    expect(stageOf(res.record, ctx, at(14))).toBe("checkin");
    expect(res.record.lapseCount).toBe(2);
    expect(res.events.filter((e) => e.type === "nearby").length).toBe(3);
  });
  it("closes the token as missed after too many lapses", () => {
    const res = reconcile(makeToken({ aheadAtJoin: 10 }), ctx, at(200));
    expect(res.record.missedAt).not.toBeNull();
    expect(res.record.lapseCount).toBe(3);
    expect(stageOf(res.record, ctx, at(200))).toBe("missed");
    expect(res.events.at(-1)?.type).toBe("missed");
  });
  it("rejects confirmation when no prompt is open", () => {
    expect(() => confirmCheckin(makeToken(), ctx, at(1))).toThrowError(DomainError);
  });
  it("accepts a late confirmation against the fresh prompt that opens after a setback", () => {
    const r1 = reconcile(makeToken({ aheadAtJoin: 10 }), ctx, at(7) + 1000).record;
    const res = confirmCheckin(r1, ctx, at(10) + 5000);
    expect(res.record.lapseCount).toBe(1);
    expect(res.record.delayPositions).toBe(3);
    expect(res.record.checkinConfirmedAt).toBe(at(10) + 5000);
  });
  it("reports an expired check-in distinctly once the token has been closed", () => {
    const r1 = reconcile(makeToken({ aheadAtJoin: 10 }), ctx, at(7) + 1000).record;
    try {
      confirmCheckin(r1, ctx, at(200));
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("checkin_expired");
    }
  });
  it("skips check-in when joining near the front", () => {
    const t = makeToken({ aheadAtJoin: 2 });
    const res = reconcile(t, ctx, at(0));
    expect(res.record.checkinConfirmedAt).toBe(T0);
    expect(stageOf(res.record, ctx, at(0))).toBe("waiting");
    const called = reconcile(res.record, ctx, at(2));
    expect(stageOf(called.record, ctx, at(2))).toBe("called");
  });
  it("calls an empty-line token straight away", () => {
    const res = reconcile(makeToken({ aheadAtJoin: 0 }), ctx, T0 + 1);
    expect(stageOf(res.record, ctx, T0 + 1)).toBe("called");
  });
});

describe("moving back", () => {
  it("pushes the token back without counting a lapse", () => {
    const r1 = reconcile(makeToken(), ctx, at(5) + 1000).record;
    const moved = moveBack(r1, ctx, at(5) + 2000).record;
    expect(moved.delayPositions).toBe(3);
    expect(moved.lapseCount).toBe(0);
    expect(moved.checkinConfirmedAt).toBeNull();
    expect(aheadAt(moved, ctx.timing, at(5) + 2000)).toBe(6);
    expect(stageOf(moved, ctx, at(5) + 2000)).toBe("waiting");
  });
  it("requires a fresh check-in afterwards", () => {
    const moved = moveBack(makeToken({ aheadAtJoin: 2, checkinConfirmedAt: T0 }), ctx, at(0)).record;
    expect(moved.checkinConfirmedAt).toBeNull();
    const res = reconcile(moved, ctx, at(3));
    expect(stageOf(res.record, ctx, at(3))).toBe("checkin");
  });
  it("is not allowed once called", () => {
    const called = reconcile(makeToken({ aheadAtJoin: 0 }), ctx, at(1)).record;
    expect(() => moveBack(called, ctx, at(1))).toThrowError(DomainError);
  });
});

describe("being called", () => {
  const called = () => reconcile(makeToken({ aheadAtJoin: 0 }), ctx, at(1)).record;

  it("gives five minutes to reach the counter, then marks the token missed", () => {
    const c = called();
    expect(c.calledAt).toBe(T0);
    expect(stageOf(reconcile(c, ctx, at(4)).record, ctx, at(4))).toBe("called");
    const late = reconcile(c, ctx, at(5) + 1000);
    expect(stageOf(late.record, ctx, at(5) + 1000)).toBe("missed");
    expect(late.record.missedAt).toBe(at(5));
  });
  it("grants one extension and no more", () => {
    const c = called();
    const ext = requestMoreTime(c, ctx, at(1)).record;
    expect(ext.extraTimeMs).toBe(2 * MIN);
    expect(stageOf(reconcile(ext, ctx, at(6)).record, ctx, at(6))).toBe("called");
    expect(stageOf(reconcile(ext, ctx, at(7) + 1000).record, ctx, at(7) + 1000)).toBe("missed");
    try {
      requestMoreTime(ext, ctx, at(2));
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("no_more_time");
    }
  });
  it("starts serving after the customer says they are on their way and arrives", () => {
    const c = markOnMyWay(called(), ctx, at(2)).record;
    expect(stageOf(reconcile(c, ctx, at(2) + 10_000).record, ctx, at(2) + 10_000)).toBe("called");
    const arrived = reconcile(c, ctx, at(2) + 30_000);
    expect(stageOf(arrived.record, ctx, at(2) + 30_000)).toBe("serving");
    expect(arrived.events.map((e) => e.type)).toEqual(["serving"]);
  });
  it("is served after the service time", () => {
    const c = markOnMyWay(called(), ctx, at(2)).record;
    const done = reconcile(c, ctx, at(2) + 20_000 + 2 * MIN + 1);
    expect(stageOf(done.record, ctx, T0 + 10 * MIN)).toBe("served");
    expect(done.events.map((e) => e.type)).toEqual(["serving", "served"]);
  });
  it("does not let a customer who arrives after the deadline in", () => {
    // Tapped with 10 s left, but the walk takes 20 s: the window closes first.
    const c = markOnMyWay(called(), ctx, at(5) - 10_000).record;
    const res = reconcile(c, ctx, at(10));
    expect(stageOf(res.record, ctx, at(10))).toBe("missed");
    expect(res.record.servingStartedAt).toBeNull();
  });
  it("rejects on my way after the window has closed", () => {
    expect(() => markOnMyWay(called(), ctx, at(5) + 10_000)).toThrowError(DomainError);
  });
  it("on my way is idempotent and only valid when called", () => {
    const c = markOnMyWay(called(), ctx, at(2)).record;
    expect(markOnMyWay(c, ctx, at(2) + 5_000).record.onMyWayAt).toBe(at(2));
    expect(markOnMyWay(c, ctx, at(3)).record.onMyWayAt).toBe(at(2)); // even once serving has begun
    expect(() => markOnMyWay(makeToken(), ctx, at(1))).toThrowError(DomainError);
  });
  it("lets mock staff serve and finish out of band", () => {
    const s = startServing(called(), ctx, at(2)).record;
    expect(stageOf(s, ctx, at(2))).toBe("serving");
    const f = finishServing(s, ctx, at(3)).record;
    expect(stageOf(f, ctx, at(3))).toBe("served");
  });
});

describe("leaving", () => {
  it("lets a waiting customer leave", () => {
    const l = leaveQueue(makeToken(), ctx, at(1)).record;
    expect(stageOf(l, ctx, at(1))).toBe("left");
    expect(l.leftAt).toBe(at(1));
  });
  it("freezes a left token", () => {
    const l = leaveQueue(makeToken(), ctx, at(1)).record;
    const res = reconcile(l, ctx, at(60));
    expect(res.record.calledAt).toBeNull();
    expect(res.events).toEqual([]);
  });
  it("cannot leave while being served", () => {
    const s = startServing(reconcile(makeToken({ aheadAtJoin: 0 }), ctx, at(1)).record, ctx, at(1)).record;
    expect(() => leaveQueue(s, ctx, at(1))).toThrowError(DomainError);
  });
});

describe("clock safety", () => {
  it("ignores reconciling into the past", () => {
    const t = makeToken({ reconciledAt: at(10) });
    const res = reconcile(t, ctx, at(5));
    expect(res.record.reconciledAt).toBe(at(10));
    expect(res.events).toEqual([]);
  });
});

describe("deriveView", () => {
  it("shows position, wait and now serving while waiting", () => {
    const r = reconcile(makeToken(), ctx, at(0)).record;
    const v = deriveView(r, ctx, at(0), info);
    expect(v).toMatchObject({ stage: "waiting", ahead: 8, position: 9, nowServingCode: "C-039", counter: null });
    expect(v.estWait.maxMin).toBeGreaterThan(v.estWait.minMin);
  });
  it("matches the mockup: 3 ahead of C-047 is serving C-044", () => {
    const r = reconcile(makeToken(), ctx, at(5)).record;
    const v = deriveView(r, ctx, at(5), info);
    expect(v.ahead).toBe(3);
    expect(v.nowServingCode).toBe("C-044");
    expect(v.stage).toBe("checkin");
    expect(v.checkinDeadline).toBe(at(8));
    expect(v.counter).toBe(4);
    expect(v.counterIsAssigned).toBe(false);
  });
  it("exposes the call deadline and counter once called", () => {
    const r = reconcile(makeToken({ aheadAtJoin: 0 }), ctx, at(1)).record;
    const v = deriveView(r, ctx, at(1), info);
    expect(v).toMatchObject({ stage: "called", counter: 4, counterIsAssigned: true, ahead: 0, canRequestMoreTime: true });
    expect(v.callDeadline).toBe(at(5));
    expect(v.estWait).toEqual({ minMin: 0, maxMin: 0 });
  });
  it("reports waited and saved time after the call", () => {
    const r = reconcile(makeToken(), ctx, at(5) + 1000).record;
    const confirmed = confirmCheckin(r, ctx, at(6)).record;
    const called = reconcile(confirmed, ctx, at(9)).record;
    const v = deriveView(called, ctx, at(9), info);
    expect(v.waitedMs).toBe(8 * MIN);
    expect(v.savedMs).toBeGreaterThan(0);
  });
  it("hides extension once used", () => {
    const c = reconcile(makeToken({ aheadAtJoin: 0 }), ctx, at(1)).record;
    const ext = requestMoreTime(c, ctx, at(1)).record;
    expect(deriveView(ext, ctx, at(1), info).canRequestMoreTime).toBe(false);
  });
});
