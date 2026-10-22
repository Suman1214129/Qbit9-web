import { beforeEach, describe, expect, it } from "vitest";
import { clock } from "@/lib/clock";
import type { DomainError } from "@/domain";
import { resetDb } from "../db";
import { createMockServices } from "../index";
import { DEMO_PIN } from "./accounts";

const BRANCH = { id: "br_sbi_main_road", lat: 23.0225, lng: 72.5714 };
const proof = () => ({ lat: BRANCH.lat, lng: BRANCH.lng, accuracyM: 15, capturedAt: clock.now() });
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: DomainError) => e.code);

const mk = () => createMockServices({ devtools: true });

async function staff(employeeId = "E48213") {
  const s = mk();
  await s.staff.signIn({ employeeId, pin: DEMO_PIN });
  return s;
}

async function customer(s: ReturnType<typeof mk>) {
  const ch = await s.auth.requestOtp("phone", "9876543210");
  await s.auth.verifyOtp({ channel: "phone", identifier: "9876543210", code: ch.debugCode as string, name: "Suman", remember: true });
}

beforeEach(() => {
  localStorage.clear();
  resetDb();
  clock.setOffset(0);
});

describe("staff sign in", () => {
  it("rejects bad input and wrong PINs without saying which part was wrong", async () => {
    const s = mk();
    expect(await code(s.staff.signIn({ employeeId: "x", pin: DEMO_PIN }))).toBe("invalid_credentials");
    expect(await code(s.staff.signIn({ employeeId: "E48213", pin: "12" }))).toBe("invalid_credentials");
    expect(await code(s.staff.signIn({ employeeId: "E48213", pin: "9999" }))).toBe("invalid_credentials");
    expect(await code(s.staff.signIn({ employeeId: "E99999", pin: DEMO_PIN }))).toBe("invalid_credentials");
    expect(await s.staff.getSession()).toBeNull();
  });
  it("locks the account after five wrong PINs, even for the right PIN, then unlocks", async () => {
    const s = mk();
    for (let i = 0; i < 4; i++) await code(s.staff.signIn({ employeeId: "E48213", pin: "9999" }));
    expect(await code(s.staff.signIn({ employeeId: "E48213", pin: "9999" }))).toBe("account_locked");
    expect(await code(s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN }))).toBe("account_locked");
    clock.setOffset(6 * 60_000);
    expect(await code(s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN }))).toBe("ok");
  });
  it("signs in, reports the session, and signs out", async () => {
    const s = await staff("e48213");
    expect((await s.staff.getSession())?.staff.name).toBe("Meera Joshi");
    await s.staff.signOut();
    expect(await s.staff.getSession()).toBeNull();
    expect(await code(s.staff.roster())).toBe("not_signed_in");
  });
  it("expires the session after eight hours", async () => {
    const s = await staff();
    clock.setOffset(9 * 3_600_000);
    expect(await s.staff.getSession()).toBeNull();
  });
});

describe("shift", () => {
  it("needs a started shift before any counter action", async () => {
    const s = await staff();
    expect(await code(s.staff.counter())).toBe("shift_not_started");
    expect(await code(s.staff.callNext())).toBe("shift_not_started");
  });
  it("starts at the assigned counter, or another free one, and not at a taken counter", async () => {
    const a = await staff("E48213");
    const st = await a.staff.startShift();
    expect(st.counter.number).toBe(4);
    expect(st.shift.status).toBe("open");
    const roster = await a.staff.roster();
    expect(roster.countersOpen).toBe(1);

    await a.staff.signOut();
    await a.staff.signIn({ employeeId: "E48214", pin: DEMO_PIN });
    expect(await code(a.staff.startShift(4))).toBe("counter_taken");
    expect(await code(a.staff.startShift(99))).toBe("counter_not_found");
    expect((await a.staff.startShift(5)).counter.number).toBe(5);
  });
  it("takes a break, resumes, and ends the shift with a summary", async () => {
    const s = await staff();
    await s.staff.startShift();
    const br = await s.staff.startBreak("lunch");
    expect(br.shift.status).toBe("break");
    expect(br.onBreak?.reason).toBe("lunch");
    expect(await code(s.staff.callNext())).toBe("shift_on_break");
    expect((await s.staff.resumeFromBreak()).shift.status).toBe("open");
    const done = await s.staff.endShift();
    expect(done.shift.status).toBe("ended");
    expect(done.lastShift?.served).toBeGreaterThanOrEqual(0);
    expect(await code(s.staff.counter())).toBe("shift_not_started");
  });
  it("makes customers wait longer while a cash counter is on a break", async () => {
    const s = await staff();
    await s.staff.startShift();
    const before = (await s.branches.catalogue(BRANCH.id)).flatMap((g) => g.services).find((x) => x.id === "svc_cash");
    await s.staff.startBreak("tea");
    const during = (await s.branches.catalogue(BRANCH.id)).flatMap((g) => g.services).find((x) => x.id === "svc_cash");
    expect(during!.usualWait.maxMin).toBeGreaterThan(before!.usualWait.maxMin);
    await s.staff.resumeFromBreak();
    const after = (await s.branches.catalogue(BRANCH.id)).flatMap((g) => g.services).find((x) => x.id === "svc_cash");
    expect(after!.usualWait).toEqual(before!.usualWait);
  });
});

describe("counter", () => {
  it("shows a crowd for the counter's services and calls the first in order", async () => {
    const s = await staff();
    const st = await s.staff.startShift();
    expect(st.next.length).toBeGreaterThan(0);
    expect(st.current).toBeNull();
    expect(st.next.every((e) => ["grp_cash"].includes(e.groupId))).toBe(true);
    const expected = st.nextCallable!;
    const after = await s.staff.callNext();
    expect(after.current?.id).toBe(expected.id);
    expect(after.current?.status).toBe("called");
    expect(after.shift.callNextPresses).toBe(1);
  });
  it("makes staff decide about a customer who has not arrived", async () => {
    const s = await staff();
    await s.staff.startShift();
    await s.staff.callNext();
    expect(await code(s.staff.callNext())).toBe("current_not_arrived");
    expect(await code(s.staff.callNext({ closeCurrentAs: "served" }))).toBe("invalid_state");
    const st = await s.staff.callNext({ closeCurrentAs: "no_show" });
    expect(st.current?.status).toBe("called");
    const today = await s.staff.today();
    expect(today.summary.noShows).toBeGreaterThanOrEqual(1);
  });
  it("closes a customer who arrived as served when calling the next", async () => {
    const s = await staff();
    await s.staff.startShift();
    const first = (await s.staff.callNext()).current!;
    await s.staffDev!.arriveNow();
    const mid = await s.staff.counter();
    expect(mid.current?.status).toBe("serving");
    const st = await s.staff.callNext();
    expect(st.current?.id).not.toBe(first.id);
    const queue = await s.staff.queue("all");
    expect(queue.waiting.some((e) => e.id === first.id)).toBe(false);
  });
  it("finishes the last customer when nobody is waiting", async () => {
    const s = await staff();
    await s.staff.startShift();
    let st = await s.staff.counter();
    while (st.nextCallable) {
      await s.staff.callNext({ closeCurrentAs: "no_show" }).catch(() => undefined);
      st = await s.staff.counter();
      if (!st.current) break;
    }
    expect(await code(s.staff.finishCurrent())).not.toBe("shift_not_started");
  });
  it("recalls at most twice, then points to a no-show", async () => {
    const s = await staff();
    await s.staff.startShift();
    await s.staff.callNext();
    await s.staff.recall();
    await s.staff.recall();
    expect(await code(s.staff.recall())).toBe("recall_limit");
  });
  it("holds a customer at the counter and resumes them only when the counter is clear", async () => {
    const s = await staff();
    await s.staff.startShift();
    expect(await code(s.staff.hold())).toBe("invalid_state");
    await s.staff.callNext();
    expect(await code(s.staff.hold())).toBe("invalid_state"); // not arrived yet
    await s.staffDev!.arriveNow();
    const held = await s.staff.hold();
    expect(held.current).toBeNull();
    expect(held.held).toHaveLength(1);
    const id = held.held[0]!.id;
    await s.staff.callNext();
    expect(await code(s.staff.resume(id))).toBe("counter_busy");
  });
  it("saves a short note and rejects a long one", async () => {
    const s = await staff();
    await s.staff.startShift();
    await s.staff.callNext();
    expect((await s.staff.setNote("  needs a pen  ")).current?.note).toBe("needs a pen");
    expect(await code(s.staff.setNote("x".repeat(141)))).toBe("invalid_note");
  });
  it("transfers to another cash counter that is open and free", async () => {
    const s = mk();
    // One browser holds one staff session, so a second staff member is set up by switching.
    await s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN });
    await s.staff.startShift();
    await s.staff.callNext();
    await s.staffDev!.arriveNow();
    expect(await code(s.staff.transfer(5))).toBe("no_other_counter");

    await s.staff.signOut();
    await s.staff.signIn({ employeeId: "E48214", pin: DEMO_PIN });
    await s.staff.startShift();
    await s.staff.signOut();

    await s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN });
    const st = await s.staff.counter();
    expect(st.transferTargets.map((t) => t.number)).toEqual([5]);
    const moved = await s.staff.transfer(5);
    expect(moved.current).toBeNull();

    await s.staff.signOut();
    await s.staff.signIn({ employeeId: "E48214", pin: DEMO_PIN });
    expect((await s.staff.counter()).current?.status).toBe("called");
  });
  it("blocks the break while someone is at the counter", async () => {
    const s = await staff();
    await s.staff.startShift();
    await s.staff.callNext();
    expect(await code(s.staff.startBreak("tea"))).toBe("finish_current_first");
    expect(await code(s.staff.endShift())).toBe("finish_current_first");
  });
  it("lets staff call someone out of turn, but only from their own services", async () => {
    const s = await staff();
    await s.staff.startShift();
    const q = await s.staff.queue("all");
    const other = q.waiting.find((e) => !q.myGroupIds.includes(e.groupId));
    if (other) expect(await code(s.staff.callNext({ entryId: other.id }))).toBe("entry_not_callable");
    const mineWaiting = (await s.staff.queue("mine")).waiting;
    const third = mineWaiting[mineWaiting.length - 1]!;
    const st = await s.staff.callNext({ entryId: third.id });
    expect(st.current?.id).toBe(third.id);
  });
});

describe("queue", () => {
  it("orders priority first, then arrival, and scopes to my services", async () => {
    const s = await staff();
    await s.staff.startShift();
    const mine = await s.staff.queue("mine");
    const all = await s.staff.queue("all");
    expect(all.allCount).toBeGreaterThanOrEqual(mine.mineCount);
    const w = mine.waiting;
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1]!;
      const b = w[i]!;
      const pa = a.priority.length ? 0 : 1;
      const pb = b.priority.length ? 0 : 1;
      expect(pa < pb || (pa === pb && a.orderAt <= b.orderAt)).toBe(true);
    }
  });
});

describe("walk-in", () => {
  it("issues a token that joins the queue behind others and is visible to staff", async () => {
    const s = await staff();
    await s.staff.startShift();
    const before = (await s.staff.queue("mine")).mineCount;
    const r = await s.staff.issueWalkIn({ name: "Ramesh", phone: "", serviceId: "svc_cash", priority: [] });
    expect(r.entry.code).toMatch(/^C-\d{3}$/);
    expect(r.entry.origin).toBe("counter");
    expect(r.ahead).toBeGreaterThanOrEqual(1);
    const q = await s.staff.queue("mine");
    expect(q.mineCount).toBe(before + 1);
    expect(q.waiting.some((e) => e.id === r.entry.id)).toBe(true);
  });
  it("lets a priority walk-in jump the line but not other priority customers", async () => {
    const s = await staff();
    await s.staff.startShift();
    const r = await s.staff.issueWalkIn({ name: "", phone: "", serviceId: "svc_cash", priority: ["senior_citizen"] });
    const q = await s.staff.queue("mine");
    const idx = q.waiting.findIndex((e) => e.id === r.entry.id);
    expect(q.waiting.slice(0, idx).every((e) => e.priority.length > 0)).toBe(true);
  });
  it("validates name, phone, service and drops unknown priority tags", async () => {
    const s = await staff();
    await s.staff.startShift();
    expect(await code(s.staff.issueWalkIn({ name: "R2D2!!", phone: "", serviceId: "svc_cash", priority: [] }))).toBe("invalid_name");
    expect(await code(s.staff.issueWalkIn({ name: "Ramesh", phone: "123", serviceId: "svc_cash", priority: [] }))).toBe("invalid_phone");
    expect(await code(s.staff.issueWalkIn({ name: "Ramesh", phone: "", serviceId: "nope", priority: [] }))).toBe("service_not_found");
    const r = await s.staff.issueWalkIn({ name: "Ramesh", phone: "98765 43210", serviceId: "svc_cash", priority: ["bogus" as never] });
    expect(r.entry.priority).toEqual([]);
  });
  it("lists the services the branch offers", async () => {
    const s = await staff();
    const groups = await s.staff.walkInServices();
    expect(groups.flatMap((g) => g.services).some((x) => x.id === "svc_cash")).toBe(true);
  });
});

describe("the customer's app token", () => {
  it("is visible to staff, and a staff call reaches the customer", async () => {
    const s = mk();
    await customer(s);
    const token = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    expect(token.stage).toBe("waiting");

    await s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN });
    await s.staff.startShift();
    const q = await s.staff.queue("mine");
    const live = q.waiting.find((e) => e.id === token.id);
    expect(live?.live).toBe(true);
    expect(live?.name).toBe("Suman");

    const st = await s.staff.callNext({ entryId: token.id });
    expect(st.current?.id).toBe(token.id);

    const view = await s.queue.get({ id: token.id });
    expect(view.stage).toBe("called");
    expect(view.counter).toBe(4);

    await s.queue.onMyWay(token.id);
    expect((await s.staff.counter()).current?.replied).toBe(true);

    await s.staffDev!.arriveNow();
    expect((await s.queue.get({ id: token.id })).stage).toBe("serving");

    // The customer simulation must not finish a visit staff are still handling.
    clock.setOffset(10 * 60_000);
    expect((await s.queue.get({ id: token.id })).stage).toBe("serving");

    await s.staff.finishCurrent();
    expect((await s.queue.get({ id: token.id })).stage).toBe("served");
  });
  it("cannot be called while the customer still has to confirm they are here", async () => {
    const s = mk();
    await customer(s);
    const token = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    await s.dev!.skipToNearby(token.id);
    expect((await s.queue.get({ id: token.id })).stage).toBe("checkin");
    await s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN });
    await s.staff.startShift();
    expect(await code(s.staff.callNext({ entryId: token.id }))).toBe("entry_not_callable");
    await s.queue.confirmCheckin(token.id, proof());
    expect(await code(s.staff.callNext({ entryId: token.id }))).toBe("ok");
  });
  it("shows a lapsed call as an automatic no-show that staff can undo", async () => {
    const s = mk();
    await customer(s);
    const token = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    await s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN });
    await s.staff.startShift();
    await s.staff.callNext({ entryId: token.id });
    clock.setOffset(6 * 60_000);
    expect((await s.queue.get({ id: token.id })).stage).toBe("missed");
    const today = await s.staff.today();
    const auto = today.autoClosed.find((e) => e.id === token.id);
    expect(auto?.closedBy).toBe("auto");

    const back = await s.staff.undoClosure(token.id);
    expect(back.autoClosed.some((e) => e.id === token.id)).toBe(false);
    expect((await s.queue.get({ id: token.id })).stage).toBe("called");
  });
  it("recall gives the customer a fresh window", async () => {
    const s = mk();
    await customer(s);
    const token = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    await s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN });
    await s.staff.startShift();
    await s.staff.callNext({ entryId: token.id });
    const first = await s.queue.get({ id: token.id });
    clock.setOffset(3 * 60_000);
    await s.staff.recall();
    const again = await s.queue.get({ id: token.id });
    expect(again.callDeadline!).toBeGreaterThan(first.callDeadline!);
    clock.setOffset(7 * 60_000);
    expect((await s.queue.get({ id: token.id })).stage).toBe("called");
  });
  it("marking a customer who never came as a no-show closes their token as missed", async () => {
    const s = mk();
    await customer(s);
    const token = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    await s.staff.signIn({ employeeId: "E48213", pin: DEMO_PIN });
    await s.staff.startShift();
    await s.staff.callNext({ entryId: token.id });
    await s.staff.finishCurrent("no_show");
    expect((await s.queue.get({ id: token.id })).stage).toBe("missed");
    const today = await s.staff.today();
    expect(today.autoClosed.some((e) => e.id === token.id)).toBe(false); // staff closed it, so it is not an automatic closure
  });
});

describe("today", () => {
  it("counts what this counter did and gives a pressed-Call-next total", async () => {
    const s = await staff();
    const st = await s.staff.startShift();
    const before = (await s.staff.today()).summary.served;
    expect(before).toBe(st.served);
    await s.staff.callNext();
    await s.staffDev!.arriveNow();
    await s.staff.callNext();
    const t = await s.staff.today();
    expect(t.summary.served).toBe(before + 1);
    expect(t.shift.callNextPresses).toBe(2);
    expect(t.summary.hourly.length).toBeGreaterThan(0);
  });
});

describe("roster after the shift opens", () => {
  it("can be read right after start without recursing", async () => {
    const s = await staff();
    await s.staff.roster();
    await s.staff.startShift();
    const r = await s.staff.roster();
    expect(r.shift.status).toBe("open");
    await s.staff.counter();
  });
});

describe("reads do not write", () => {
  it("does not fire a change event when nothing changed", async () => {
    const s = await staff();
    await s.staff.roster();
    let hits = 0;
    const off = s.staff.subscribe(() => { hits += 1; });
    await s.staff.roster();
    await s.staff.roster();
    off();
    expect(hits).toBe(0);
  });
});

describe("one queue for customers and staff", () => {
  const join = (s: ReturnType<typeof mk>) => s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });

  it("a customer's place is the real queue while a counter is open, and moves when staff call people", async () => {
    const s = await staff();
    await s.staff.startShift();
    await customer(s);
    const token = await join(s);
    const q = await s.staff.queue("mine");
    const idx = q.waiting.findIndex((e) => e.id === token.id);
    expect(idx).toBeGreaterThan(0);
    expect((await s.queue.get({ id: token.id })).ahead).toBe(idx);

    await s.staff.callNext();
    await s.staffDev!.arriveNow();
    expect((await s.queue.get({ id: token.id })).ahead).toBe(idx - 1);
    await s.staff.callNext();
    expect((await s.queue.get({ id: token.id })).ahead).toBe(idx - 2);
  });

  it("does not call a customer by itself while staff are working", async () => {
    const s = await staff();
    await s.staff.startShift();
    await customer(s);
    const token = await join(s);
    clock.setOffset(30 * 60_000);
    const v = await s.queue.get({ id: token.id });
    expect(["waiting", "checkin"]).toContain(v.stage);
    expect(v.calledAt).toBeNull();
  });

  it("asks for a check-in when staff bring the customer within three, and holds them from being called until they confirm", async () => {
    const s = await staff();
    await s.staff.startShift();
    await customer(s);
    const token = await join(s);
    let guard = 0;
    for (; guard < 12; guard++) {
      const v = await s.queue.get({ id: token.id });
      if (v.stage === "checkin") break;
      await s.staffDev!.arriveNow();
      await s.staff.callNext();
    }
    const v = await s.queue.get({ id: token.id });
    expect(v.stage).toBe("checkin");
    const entry = (await s.staff.queue("mine")).waiting.find((e) => e.id === token.id);
    expect(entry?.confirming).toBe(true);
    expect(await code(s.staff.callNext({ entryId: token.id }))).toBe("entry_not_callable");
    await s.queue.confirmCheckin(token.id, proof());
    await s.staffDev!.arriveNow();
    await s.staff.callNext({ entryId: token.id });
    expect((await s.queue.get({ id: token.id })).stage).toBe("called");
  });

  it("falls back to the customer's own simulation when no counter is open", async () => {
    const s = mk();
    await customer(s);
    const token = await join(s);
    clock.setOffset(60 * 60_000);
    expect((await s.queue.get({ id: token.id })).stage).not.toBe("waiting");
  });


  it("shows the real waiting count on the service list while staff are in", async () => {
    const s = await staff();
    await s.staff.startShift();
    const cash = (await s.staff.queue("mine")).waiting.filter((e) => e.groupId === "grp_cash").length;
    const groups = await s.branches.catalogue(BRANCH.id);
    const svc = groups.flatMap((g) => g.services).find((x) => x.id === "svc_cash");
    expect(svc?.waiting).toBe(cash);
  });
});
