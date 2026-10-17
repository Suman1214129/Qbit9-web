import type { LocationProof } from "@/domain";
import { clock } from "./clock";

export type GeoPermission = "granted" | "denied" | "prompt" | "unsupported";
export type GeoFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export class GeoError extends Error {
  readonly reason: GeoFailure;
  constructor(reason: GeoFailure) {
    super(reason);
    this.name = "GeoError";
    this.reason = reason;
  }
}

export const geolocationSupported = () => typeof navigator !== "undefined" && "geolocation" in navigator;

/** Permission state without prompting. Safari lacks the Permissions API for geolocation in older versions. */
export async function geoPermission(): Promise<GeoPermission> {
  if (!geolocationSupported()) return "unsupported";
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    return status ? (status.state as GeoPermission) : "prompt";
  } catch {
    return "prompt";
  }
}

/** One high accuracy reading. Never watches, so nothing is tracked after it returns. */
export function readPosition(opts: { timeoutMs?: number; maxAgeMs?: number } = {}): Promise<LocationProof> {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) return reject(new GeoError("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          capturedAt: clock.now(),
        }),
      (err) => {
        reject(new GeoError(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable"));
      },
      { enableHighAccuracy: true, timeout: opts.timeoutMs ?? 12_000, maximumAge: opts.maxAgeMs ?? 15_000 },
    );
  });
}
