import { beforeEach, describe, expect, it } from "vitest";
import { createMockServices } from "./index";
import { resetDb } from "./db";
import { clock } from "@/lib/clock";
import type { DomainError } from "@/domain";

const BRANCH = { id: "br_sbi_main_road", lat: 23.0225, lng: 72.5714 };
const proof = (lat = BRANCH.lat, lng = BRANCH.lng) => ({ lat, lng, accuracyM: 15, capturedAt: clock.now() });

async function signedIn() {
  const s = createMockServices({ devtools: true });
  const ch = await s.auth.requestOtp("phone", "98765 43210");
  await s.auth.verifyOtp({ channel: "phone", identifier: "9876543210", code: ch.debugCode as string, name: "Suman", remember: true });
  return s;
}
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: DomainError) => e.code);

beforeEach(() => {
  localStorage.clear();
  resetDb();
  clock.setOffset(0);
});

describe("mock auth", () => {
  it("rejects a wrong code, then accepts the right one", async () => {
    const s = createMockServices({ devtools: false });
    const ch = await s.auth.requestOtp("phone", "9876543210");
    expect(ch.needsName).toBe(true);
    const wrong = ch.debugCode === "1111" ? "2222" : "1111";
    expect(await code(s.auth.verifyOtp({ channel: "phone", identifier: "9876543210", code: wrong, remember: false }))).toBe("invalid_code");
    await s.auth.verifyOtp({ channel: "phone", identifier: "9876543210", code: ch.debugCode as string, name: "Suman", remember: false });
    expect((await s.auth.getSession())?.user.name).toBe("Suman");
  });
  it("locks after too many attempts", async () => {
    const s = createMockServices({ devtools: false });
    const ch = await s.auth.requestOtp("phone", "9876543210");
    const wrong = ch.debugCode === "1111" ? "2222" : "1111";
    for (let i = 0; i < 5; i++) await code(s.auth.verifyOtp({ channel: "phone", identifier: "9876543210", code: wrong, remember: false }));
    expect(await code(s.auth.verifyOtp({ channel: "phone", identifier: "9876543210", code: ch.debugCode as string, remember: false }))).toBe("too_many_attempts");
  });
  it("does not ask a known user for their name again", async () => {
    const s = await signedIn();
    await s.auth.signOut();
    expect((await s.auth.requestOtp("phone", "9876543210")).needsName).toBe(false);
  });
  it("rejects a bad phone", async () => {
    const s = createMockServices({ devtools: false });
    expect(await code(s.auth.requestOtp("phone", "123"))).toBe("invalid_phone");
  });
});

describe("mock queue", () => {
  it("requires sign in", async () => {
    const s = createMockServices({ devtools: false });
    expect(await code(s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() }))).toBe("not_signed_in");
  });
  it("blocks joining from far away, allows it at the branch", async () => {
    const s = await signedIn();
    expect(await code(s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof(23.0525) }))).toBe("too_far");
    const t = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    expect(t.code).toMatch(/^C-\d{3}$/);
    expect(t.ahead).toBeGreaterThan(0);
  });
  it("allows one active token", async () => {
    const s = await signedIn();
    await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    expect(await code(s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cheque", priority: [], proof: proof() }))).toBe("already_in_queue");
  });
  it("runs the whole journey with the dev helpers", async () => {
    const s = await signedIn();
    const t = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    await s.dev!.skipToNearby(t.id);
    expect((await s.queue.get({ id: t.id })).stage).toMatch(/checkin|waiting/);
    const v = await s.queue.get({ id: t.id });
    if (v.stage === "checkin") await s.queue.confirmCheckin(t.id, proof());
    await s.dev!.callNow(t.id);
    const called = await s.queue.get({ id: t.id });
    expect(called.stage).toBe("called");
    expect(called.counter).not.toBeNull();
    await s.queue.onMyWay(t.id);
    await s.dev!.staffStartServing(t.id);
    expect((await s.queue.get({ id: t.id })).stage).toBe("serving");
    await s.dev!.staffFinish(t.id);
    const done = await s.queue.get({ code: t.code });
    expect(done.stage).toBe("served");
    expect(await s.queue.active()).toBeNull();
    await s.queue.sendFeedback(t.id, "quick");
    expect((await s.queue.get({ id: t.id })).feedback).toBe("quick");
    const h = await s.history.list();
    expect(h.items.some((i) => i.code === t.code && i.status === "served")).toBe(true);
  });
  it("refuses check-in from far away", async () => {
    const s = await signedIn();
    const t = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    await s.dev!.skipToNearby(t.id);
    const v = await s.queue.get({ id: t.id });
    if (v.stage === "checkin") expect(await code(s.queue.confirmCheckin(t.id, proof(23.06)))).toBe("too_far");
  });
  it("lets a customer leave", async () => {
    const s = await signedIn();
    const t = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    expect((await s.queue.leave(t.id)).stage).toBe("left");
    expect(await s.queue.active()).toBeNull();
  });
  it("gives priority customers a shorter line", async () => {
    const s = await signedIn();
    const a = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: ["senior_citizen"], proof: proof() });
    await s.queue.leave(a.id);
    const b = await s.queue.join({ branchId: BRANCH.id, serviceId: "svc_cash", priority: [], proof: proof() });
    expect(a.ahead).toBeLessThan(b.ahead);
  });
});

describe("mock bookings", () => {
  it("books, lists and cancels", async () => {
    const s = await signedIn();
    const days = await s.bookings.availability(BRANCH.id, "svc_loan");
    const slot = days.flatMap((d) => d.slots).find((x) => x.status === "free" && x.startsAt > clock.now() + 3 * 3_600_000)!;
    const b = await s.bookings.create({ branchId: BRANCH.id, serviceId: "svc_loan", startsAt: slot.startsAt });
    expect(b.status).toBe("upcoming");
    expect(await code(s.bookings.create({ branchId: BRANCH.id, serviceId: "svc_loan", startsAt: slot.startsAt }))).toBe("slot_unavailable");
    expect((await s.bookings.list()).length).toBe(1);
    expect((await s.bookings.cancel(b.id)).status).toBe("cancelled");
  });
  it("does not offer walk-in only services", async () => {
    const s = await signedIn();
    expect(await code(s.bookings.availability(BRANCH.id, "svc_cash"))).toBe("service_not_found");
  });
  it("checks in a booking only inside its window", async () => {
    const s = await signedIn();
    const days = await s.bookings.availability(BRANCH.id, "svc_loan");
    const slot = days.flatMap((d) => d.slots).find((x) => x.status === "free" && x.startsAt > clock.now() + 5 * 3_600_000)!;
    const b = await s.bookings.create({ branchId: BRANCH.id, serviceId: "svc_loan", startsAt: slot.startsAt });
    expect(await code(s.queue.checkInBooking({ bookingId: b.id, proof: proof() }))).toBe("booking_window");
    clock.setOffset(slot.startsAt - 10 * 60_000 - Date.now());
    const t = await s.queue.checkInBooking({ bookingId: b.id, proof: proof() });
    expect(t.source).toBe("booking");
    expect(t.ahead).toBeLessThanOrEqual(2);
    expect((await s.bookings.get(b.id)).status).toBe("checked_in");
  });
});

describe("mock branches", () => {
  it("serves a catalogue with 12 services and live waits", async () => {
    const s = createMockServices({ devtools: false });
    const cat = await s.branches.catalogue(BRANCH.id);
    expect(cat.flatMap((g) => g.services)).toHaveLength(12);
    const snap = await s.branches.snapshot(BRANCH.id);
    expect(snap.waitingTotal).toBeGreaterThan(0);
  });
  it("finds a branch by slug", async () => {
    const s = createMockServices({ devtools: false });
    expect((await s.branches.bySlug("sbi", "main-road"))?.name).toBe("Main Road Branch");
    expect(await s.branches.bySlug("sbi", "nope")).toBeNull();
  });
});
