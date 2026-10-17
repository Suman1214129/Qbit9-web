import { DEFAULT_POLICY, type Policy } from "./policy";
import { addDaysKey, hoursForDate, slotLabel, tzParts, weekdayLong, weekdayShort } from "./time";
import type { Branch, DayAvailability, EpochMs, Slot, SlotStatus } from "./types";

export interface AvailabilityInput {
  branch: Pick<Branch, "hours" | "closedDates" | "timezone">;
  now: EpochMs;
  /** People already booked at this slot start, across all customers. */
  taken: (startsAt: EpochMs) => number;
  /** How many customers can be served at once for this service. */
  capacity: number;
  policy?: Policy;
}

/** Build the bookable days (today first) with every slot's status. Closed days are kept, flagged. */
export function buildAvailability(input: AvailabilityInput): DayAvailability[] {
  const policy = input.policy ?? DEFAULT_POLICY;
  const tz = input.branch.timezone;
  const today = tzParts(input.now, tz).dateKey;
  const days: DayAvailability[] = [];

  for (let i = 0; i < policy.bookingHorizonDays; i++) {
    const key = addDaysKey(today, i);
    const hours = hoursForDate(input.branch, key);
    const parts = tzParts(hours?.opensAt ?? Date.parse(`${key}T06:00:00Z`), tz);
    const slots: Slot[] = [];

    if (hours) {
      const step = policy.slotMinutes * 60_000;
      for (let t = hours.opensAt; t + step <= hours.closesAt; t += step) {
        const p = tzParts(t, tz);
        let status: SlotStatus = "free";
        if (t < input.now + policy.bookingLeadMin * 60_000) status = "past";
        else if (input.taken(t) >= input.capacity) status = "full";
        slots.push({ startsAt: t, label: slotLabel(t, tz), part: p.hour < 12 ? "morning" : "afternoon", status });
      }
    }

    days.push({
      date: key,
      weekday: weekdayShort(parts.weekday),
      dayOfMonth: parts.day,
      open: hours != null && slots.some((s) => s.status !== "past"),
      slots,
    });
  }
  return days;
}

export function weekdayName(dateKey: string, tz: string): string {
  return weekdayLong(tzParts(Date.parse(`${dateKey}T06:30:00Z`), tz).weekday);
}

/** Lifecycle windows for a booking, shared by the UI (buttons) and the services (enforcement). */
export function bookingWindows(startsAt: EpochMs, policy: Policy = DEFAULT_POLICY) {
  const min = 60_000;
  return {
    checkinOpensAt: startsAt - policy.bookingCheckinOpensMin * min,
    holdsUntil: startsAt + policy.slotHoldMin * min,
    cancelUntil: startsAt - policy.cancelCutoffMin * min,
    reminderAt: startsAt - policy.reminderMin * min,
  };
}

export function canCheckInBooking(startsAt: EpochMs, now: EpochMs, policy: Policy = DEFAULT_POLICY): boolean {
  const w = bookingWindows(startsAt, policy);
  return now >= w.checkinOpensAt && now <= w.holdsUntil;
}

export function canCancelBooking(startsAt: EpochMs, now: EpochMs, policy: Policy = DEFAULT_POLICY): boolean {
  return now <= bookingWindows(startsAt, policy).cancelUntil;
}
