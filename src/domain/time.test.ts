import { describe, expect, it } from "vitest";
import {
  addDaysKey, clockLabel, formatClock, formatSlotFull, hoursForDate, nthWeekdayOfMonth, openStatus,
  relativeDayLabel, slotLabel, tzOffsetMs, tzParts, weekdayOfKey, zonedToEpoch,
} from "./time";

const IST = "Asia/Kolkata";
const branch = {
  timezone: IST,
  hours: [null, ...Array.from({ length: 5 }, () => ({ open: "10:00", close: "16:00" })), { open: "10:00", close: "14:00" }],
  closedDates: ["2026-10-10"],
};

describe("timezone helpers", () => {
  it("reads IST parts", () => {
    const p = tzParts(Date.UTC(2026, 9, 16, 5, 0, 0), IST);
    expect(p).toMatchObject({ year: 2026, month: 10, day: 16, hour: 10, minute: 30, weekday: 5, dateKey: "2026-10-16" });
  });
  it("rolls the date over in the zone, not UTC", () => {
    expect(tzParts(Date.UTC(2026, 9, 16, 20, 0, 0), IST).dateKey).toBe("2026-10-17");
  });
  it("knows the IST offset", () => {
    expect(tzOffsetMs(Date.UTC(2026, 0, 1), IST)).toBe(19_800_000);
  });
  it("round trips local time to epoch", () => {
    const ts = zonedToEpoch("2026-10-16", "10:00", IST);
    expect(ts).toBe(Date.UTC(2026, 9, 16, 4, 30, 0));
    expect(formatClock(ts, IST)).toBe("10 am");
  });
  it("handles a DST zone", () => {
    const summer = zonedToEpoch("2026-07-01", "09:00", "America/New_York");
    const winter = zonedToEpoch("2026-01-15", "09:00", "America/New_York");
    expect(summer).toBe(Date.UTC(2026, 6, 1, 13, 0, 0));
    expect(winter).toBe(Date.UTC(2026, 0, 15, 14, 0, 0));
  });
  it("adds days across month ends and leap years", () => {
    expect(addDaysKey("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDaysKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysKey("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("finds weekdays and nth weekday", () => {
    expect(weekdayOfKey("2026-10-10")).toBe(6);
    expect(nthWeekdayOfMonth("2026-10-10")).toBe(2);
    expect(nthWeekdayOfMonth("2026-10-24")).toBe(4);
  });
});

describe("labels", () => {
  it("formats clock labels", () => {
    expect(clockLabel(16, 0)).toBe("4 pm");
    expect(clockLabel(11, 30)).toBe("11:30 am");
    expect(clockLabel(0, 5)).toBe("12:05 am");
    expect(clockLabel(12, 0)).toBe("12 pm");
  });
  it("formats slot labels without suffix", () => {
    expect(slotLabel(zonedToEpoch("2026-10-16", "14:00", IST), IST)).toBe("2:00");
    expect(slotLabel(zonedToEpoch("2026-10-16", "10:30", IST), IST)).toBe("10:30");
  });
  it("formats full slot text", () => {
    expect(formatSlotFull(zonedToEpoch("2026-10-16", "11:30", IST), IST)).toBe("Fri 16 Oct, 11:30 am");
  });
  it("labels relative days", () => {
    const now = zonedToEpoch("2026-10-16", "10:00", IST);
    expect(relativeDayLabel(now, now, IST)).toBe("today");
    expect(relativeDayLabel(zonedToEpoch("2026-10-17", "10:00", IST), now, IST)).toBe("tomorrow");
    expect(relativeDayLabel(zonedToEpoch("2026-10-19", "10:00", IST), now, IST)).toBe("Mon 19 Oct");
  });
});

describe("branch hours", () => {
  it("returns null for closed days and holidays", () => {
    expect(hoursForDate(branch, "2026-10-11")).toBeNull(); // Sunday
    expect(hoursForDate(branch, "2026-10-10")).toBeNull(); // listed closure
    expect(hoursForDate(branch, "2026-10-17")).not.toBeNull(); // normal Saturday
  });
  it("is open inside hours and says when it closes", () => {
    const s = openStatus(branch, zonedToEpoch("2026-10-16", "11:00", IST));
    expect(s.isOpen).toBe(true);
    expect(s.closesLabel).toBe("4 pm");
  });
  it("is closed at closing time exactly", () => {
    expect(openStatus(branch, zonedToEpoch("2026-10-16", "16:00", IST)).isOpen).toBe(false);
  });
  it("reports opening later today", () => {
    const s = openStatus(branch, zonedToEpoch("2026-10-16", "08:00", IST));
    expect(s.isOpen).toBe(false);
    expect(s.opensLabel).toBe("today at 10 am");
  });
  it("skips Sunday after Saturday closes", () => {
    const s = openStatus(branch, zonedToEpoch("2026-10-17", "15:00", IST));
    expect(s.opensLabel).toBe("Mon 19 Oct at 10 am");
  });
});
