import type { WaitRange } from "@/domain";

/** "15 to 25 min", "about 8 min", "No wait". */
export function formatWaitRange(w: WaitRange): string {
  if (w.maxMin <= 0) return "No wait";
  if (w.minMin === w.maxMin) return `${w.minMin} min`;
  return `${w.minMin} to ${w.maxMin} min`;
}

/** "~20 min": single number for tight spaces, taken as the midpoint rounded to 5. */
export function formatWaitShort(w: WaitRange): string {
  if (w.maxMin <= 0) return "no wait";
  const mid = (w.minMin + w.maxMin) / 2;
  const rounded = mid < 10 ? Math.round(mid) : Math.round(mid / 5) * 5;
  return `~${rounded} min`;
}

/** 292_000 -> "4:52". Floors at zero. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 40 -> "40 m", 3200 -> "3.2 km". */
export function formatDistance(m: number): string {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** 14 -> "14 min", 90 -> "1 h 30 min", 180 -> "3 hours". */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} h ${r} min`;
}

export function formatMsAsMinutes(ms: number): string {
  return formatMinutes(ms / 60_000);
}

/** "just now", "2 min ago". */
export function formatUpdated(from: number, now: number): string {
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** Indian digit grouping for rupees: 50000 -> "₹50,000". */
export function formatRupees(n: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(n)}`;
}
