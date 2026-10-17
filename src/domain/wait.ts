import type { PriorityTag, TokenSource, WaitRange } from "./types";
import { DEFAULT_POLICY, type Policy } from "./policy";

export const NO_WAIT: WaitRange = { minMin: 0, maxMin: 0 };

const LOW = 0.85;
const HIGH = 1.3;

/**
 * Estimated wait for someone with `ahead` people in front of them.
 *
 * Each position takes `avgServiceMin / counters` minutes on average (counters work in parallel).
 * We show a range, not a point, because a single number reads as a promise.
 */
export function estimateWait(ahead: number, avgServiceMin: number, counters: number): WaitRange {
  if (ahead <= 0) return NO_WAIT;
  const perPosition = avgServiceMin / Math.max(1, counters);
  const mid = ahead * perPosition;
  const minMin = Math.max(1, Math.round(mid * LOW));
  const maxMin = Math.max(minMin + 1, Math.round(mid * HIGH));
  return { minMin, maxMin };
}

/** Midpoint of a range, for sorting and averages. */
export function waitMid(w: WaitRange): number {
  return (w.minMin + w.maxMin) / 2;
}

/**
 * How many people are ahead of a new token.
 * Priority tokens jump most of the line but still queue behind other priority customers;
 * booked tokens never wait behind more than `bookedMaxAhead`.
 */
export function aheadForNewToken(
  waiting: number,
  opts: { priority: readonly PriorityTag[]; source: TokenSource },
  policy: Policy = DEFAULT_POLICY,
): number {
  const w = Math.max(0, Math.floor(waiting));
  if (opts.source === "booking") return Math.min(w, policy.bookedMaxAhead);
  if (opts.priority.length > 0) return Math.min(w, Math.max(1, Math.round(w * policy.priorityAheadFactor)));
  return w;
}

/** Minutes a person could have spent elsewhere: time between joining and the check-in prompt. */
export function savedMs(joinedAt: number, promptedAt: number | null, calledAt: number | null): number {
  const end = promptedAt ?? calledAt;
  if (end == null) return 0;
  return Math.max(0, end - joinedAt);
}
