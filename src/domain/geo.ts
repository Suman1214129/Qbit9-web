import { DomainError } from "./errors";
import { DEFAULT_POLICY, type Policy } from "./policy";
import type { Branch, EpochMs, GeoPoint, LocationProof } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). Accurate to well under a metre at branch scale. */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidPoint(p: GeoPoint): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

/** Initial compass bearing from a to b, in degrees 0..360. Used for the "which way" hint. */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export type ProximityStatus = "within" | "too_far" | "low_accuracy" | "stale";

export interface ProximityResult {
  status: ProximityStatus;
  distanceM: number;
  accuracyM: number;
  radiusM: number;
  /** Metres still to cover to reach the join radius. 0 when within. */
  shortfallM: number;
}

/**
 * Decide whether a location reading proves the customer is at the branch.
 *
 * Order matters: a stale or imprecise reading is reported as such rather than "too far", because
 * telling someone to walk closer when the real problem is a bad GPS fix is the wrong advice.
 */
export function evaluateProximity(
  proof: LocationProof,
  branch: Pick<Branch, "location" | "joinRadiusM">,
  now: EpochMs,
  policy: Policy = DEFAULT_POLICY,
): ProximityResult {
  const d = distanceM(proof, branch.location);
  const base = { distanceM: d, accuracyM: proof.accuracyM, radiusM: branch.joinRadiusM };
  if (now - proof.capturedAt > policy.proofTtlMs || proof.capturedAt - now > 60_000) {
    return { ...base, status: "stale", shortfallM: 0 };
  }
  if (!Number.isFinite(proof.accuracyM) || proof.accuracyM > policy.accuracyLimitM) {
    return { ...base, status: "low_accuracy", shortfallM: 0 };
  }
  if (d > branch.joinRadiusM) {
    return { ...base, status: "too_far", shortfallM: Math.max(0, d - branch.joinRadiusM) };
  }
  return { ...base, status: "within", shortfallM: 0 };
}

/** Throws the matching DomainError unless the proof puts the customer inside the join radius. */
export function assertWithinBranch(
  proof: LocationProof | null | undefined,
  branch: Pick<Branch, "location" | "joinRadiusM">,
  now: EpochMs,
  policy: Policy = DEFAULT_POLICY,
): ProximityResult {
  if (!proof || !isValidPoint(proof)) throw new DomainError("location_required");
  const r = evaluateProximity(proof, branch, now, policy);
  if (r.status === "stale") throw new DomainError("location_stale");
  if (r.status === "low_accuracy") throw new DomainError("location_inaccurate", undefined, { accuracyM: r.accuracyM });
  if (r.status === "too_far") throw new DomainError("too_far", undefined, { distanceM: r.distanceM });
  return r;
}
