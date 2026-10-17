import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "./policy";
import { bookingWindows, buildAvailability, canCancelBooking, canCheckInBooking } from "./slots";
import { zonedToEpoch } from "./time";

const IST = "Asia/Kolkata";
const branch = {
  timezone: IST,
  hours: [null, ...Array.from({ length: 5 }, () => ({ open: "10:00", close: "16:00" })), { open: "10:00", close: "14:00" }],
  closedDates: ["2026-10-24"],
};
const now = zonedToEpoch("2026-10-16", "11:00", IST); // Friday 11:00

describe("buildAvailability", () => {
  const days = buildAvailability({ branch, now, taken: () => 0, capacity: 2 });

  it("covers the booking horizon starting today", () => {
    expect(days).toHaveLength(DEFAULT_POLICY.bookingHorizonDays);
    expect(days[0]?.date).toBe("2026-10-16");
    expect(days[0]?.weekday).toBe("Fri");
    expect(days[6]?.date).toBe("2026-10-22");
  });
  it("marks Sunday closed with no slots", () => {
    const sun = days.find((d) => d.date === "2026-10-18");
    expect(sun?.open).toBe(false);
    expect(sun?.slots).toEqual([]);
  });
  it("generates half hour slots that end by closing time", () => {
    const mon = days.find((d) => d.date === "2026-10-19");
    expect(mon?.slots).toHaveLength(12);
    expect(mon?.slots[0]?.label).toBe("10:00");
    expect(mon?.slots.at(-1)?.label).toBe("3:30");
  });
  it("splits morning and afternoon", () => {
    const mon = days.find((d) => d.date === "2026-10-19")!;
    expect(mon.slots.filter((s) => s.part === "morning")).toHaveLength(4);
    expect(mon.slots.filter((s) => s.part === "afternoon")).toHaveLength(8);
  });
  it("blocks slots inside the lead time today", () => {
    const today = days[0]!;
    const byLabel = Object.fromEntries(today.slots.map((s) => [s.label, s.status]));
    expect(byLabel["10:00"]).toBe("past");
    expect(byLabel["11:00"]).toBe("past");
    expect(byLabel["11:30"]).toBe("free"); // exactly now + lead
    expect(byLabel["3:30"]).toBe("free");
  });
  it("marks a slot full when capacity is used up", () => {
    const start = zonedToEpoch("2026-10-19", "10:30", IST);
    const d = buildAvailability({ branch, now, taken: (t) => (t === start ? 2 : 1), capacity: 2 });
    const slot = d.find((x) => x.date === "2026-10-19")!.slots.find((s) => s.startsAt === start)!;
    expect(slot.status).toBe("full");
    expect(d.find((x) => x.date === "2026-10-19")!.slots.filter((s) => s.status === "full")).toHaveLength(1);
  });
  it("treats a day with only past slots as not open", () => {
    const late = buildAvailability({ branch, now: zonedToEpoch("2026-10-16", "15:45", IST), taken: () => 0, capacity: 1 });
    expect(late[0]?.open).toBe(false);
  });
  it("respects listed closures", () => {
    const d = buildAvailability({ branch, now: zonedToEpoch("2026-10-22", "09:00", IST), taken: () => 0, capacity: 1 });
    expect(d.find((x) => x.date === "2026-10-24")?.open).toBe(false);
  });
});

describe("booking windows", () => {
  const start = zonedToEpoch("2026-10-19", "11:30", IST);
  it("allows check in from 30 minutes before to 15 after", () => {
    expect(canCheckInBooking(start, start - 31 * 60_000)).toBe(false);
    expect(canCheckInBooking(start, start - 30 * 60_000)).toBe(true);
    expect(canCheckInBooking(start, start + 15 * 60_000)).toBe(true);
    expect(canCheckInBooking(start, start + 16 * 60_000)).toBe(false);
  });
  it("allows cancelling until 30 minutes before", () => {
    expect(canCancelBooking(start, start - 30 * 60_000)).toBe(true);
    expect(canCancelBooking(start, start - 29 * 60_000)).toBe(false);
  });
  it("schedules the reminder an hour before", () => {
    expect(bookingWindows(start).reminderAt).toBe(start - 60 * 60_000);
  });
});
