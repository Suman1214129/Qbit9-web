import type { Branch, DayHours, EpochMs } from "./types";

/**
 * Timezone helpers built on Intl only (no date library). Branch hours, slot labels and "today" are
 * all branch-local, never the browser's zone, so a customer abroad still sees correct hours.
 */

interface Parts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
  dateKey: string; // YYYY-MM-DD
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function tzParts(ts: EpochMs, tz: string): Parts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(ts))) out[p.type] = p.value;
  const year = Number(out.year);
  const month = Number(out.month);
  const day = Number(out.day);
  return {
    year,
    month,
    day,
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAY_INDEX[out.weekday ?? "Sun"] ?? 0,
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

/** Offset of `tz` from UTC at instant `ts`, in ms (IST is +19_800_000). */
export function tzOffsetMs(ts: EpochMs, tz: string): number {
  const p = tzParts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

export function addDaysKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Epoch for a branch-local date and "HH:mm". */
export function zonedToEpoch(dateKey: string, hhmm: string, tz: string): EpochMs {
  const { year, month, day } = parseDateKey(dateKey);
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, h ?? 0, m ?? 0);
  const off1 = tzOffsetMs(guess, tz);
  let result = guess - off1;
  const off2 = tzOffsetMs(result, tz);
  if (off2 !== off1) result = guess - off2;
  return result;
}

/** "2nd Saturday" test used to build bank holiday lists (Indian banks close on 2nd and 4th Saturdays). */
export function nthWeekdayOfMonth(key: string): number {
  return Math.ceil(parseDateKey(key).day / 7);
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const weekdayShort = (i: number) => WEEKDAY_SHORT[((i % 7) + 7) % 7] ?? "Sun";
export const weekdayLong = (i: number) => WEEKDAY_LONG[((i % 7) + 7) % 7] ?? "Sunday";
export const monthShort = (i: number) => MONTH_SHORT[i - 1] ?? "Jan";
export const monthLong = (i: number) => MONTH_LONG[i - 1] ?? "January";

/** "4 pm", "11:30 am". Minutes are dropped on the hour. */
export function formatClock(ts: EpochMs, tz: string): string {
  const p = tzParts(ts, tz);
  return clockLabel(p.hour, p.minute);
}

export function clockLabel(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${pad2(minute)} ${suffix}`;
}

/** "11:30", "2:00": used inside slot grids that already sit under a Morning or Afternoon heading. */
export function slotLabel(ts: EpochMs, tz: string): string {
  const p = tzParts(ts, tz);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad2(p.minute)}`;
}

/** "Thu, 8 Oct" */
export function formatDayMonth(ts: EpochMs, tz: string): string {
  const p = tzParts(ts, tz);
  return `${weekdayShort(p.weekday)}, ${p.day} ${monthShort(p.month)}`;
}

/** "Fri 9 Oct, 11:30 am" */
export function formatSlotFull(ts: EpochMs, tz: string): string {
  const p = tzParts(ts, tz);
  return `${weekdayShort(p.weekday)} ${p.day} ${monthShort(p.month)}, ${formatClock(ts, tz)}`;
}

/** "today", "tomorrow", or "Fri 9 Oct" relative to `now`. */
export function relativeDayLabel(ts: EpochMs, now: EpochMs, tz: string): string {
  const key = tzParts(ts, tz).dateKey;
  const today = tzParts(now, tz).dateKey;
  if (key === today) return "today";
  if (key === addDaysKey(today, 1)) return "tomorrow";
  const p = tzParts(ts, tz);
  return `${weekdayShort(p.weekday)} ${p.day} ${monthShort(p.month)}`;
}

/* --------------------------------------------------------------- branch hours */

export interface HoursWindow {
  dateKey: string;
  opensAt: EpochMs;
  closesAt: EpochMs;
}

export function hoursForDate(branch: Pick<Branch, "hours" | "closedDates" | "timezone">, dateKey: string): HoursWindow | null {
  if (branch.closedDates.includes(dateKey)) return null;
  const h: DayHours | undefined = branch.hours[weekdayOfKey(dateKey)];
  if (!h) return null;
  return {
    dateKey,
    opensAt: zonedToEpoch(dateKey, h.open, branch.timezone),
    closesAt: zonedToEpoch(dateKey, h.close, branch.timezone),
  };
}

export interface OpenStatus {
  isOpen: boolean;
  /** Current window when open. */
  window: HoursWindow | null;
  closesLabel: string | null;
  /** When closed: the next window. */
  next: HoursWindow | null;
  opensLabel: string | null;
}

export function openStatus(
  branch: Pick<Branch, "hours" | "closedDates" | "timezone">,
  now: EpochMs,
): OpenStatus {
  const tz = branch.timezone;
  const today = tzParts(now, tz).dateKey;
  const todays = hoursForDate(branch, today);
  if (todays && now >= todays.opensAt && now < todays.closesAt) {
    return { isOpen: true, window: todays, closesLabel: formatClock(todays.closesAt, tz), next: null, opensLabel: null };
  }
  let next: HoursWindow | null = null;
  if (todays && now < todays.opensAt) next = todays;
  for (let i = 1; !next && i <= 14; i++) next = hoursForDate(branch, addDaysKey(today, i));
  return {
    isOpen: false,
    window: null,
    closesLabel: null,
    next,
    opensLabel: next ? `${relativeDayLabel(next.opensAt, now, tz)} at ${formatClock(next.opensAt, tz)}` : null,
  };
}
