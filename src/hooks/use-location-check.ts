"use client";
import { useCallback, useEffect, useState } from "react";
import { evaluateProximity, type Branch, type LocationProof, type ProximityResult } from "@/domain";
import { clock } from "@/lib/clock";
import { GeoError, geoPermission, readPosition, type GeoFailure, type GeoPermission } from "@/lib/geolocation";
import { useServices } from "@/providers/services-provider";

export type LocationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; proof: LocationProof; result: ProximityResult }
  | { status: "failed"; reason: GeoFailure };

const METRES_PER_DEG = 111_195;

/**
 * One location reading judged against a branch. Never watches position.
 * In dev builds the panel can override the reading so every state is reachable from a desk.
 */
export function useLocationCheck(branch: Branch | null | undefined) {
  const { dev } = useServices();
  const [state, setState] = useState<LocationState>({ status: "idle" });
  const [permission, setPermission] = useState<GeoPermission>("prompt");

  useEffect(() => {
    void geoPermission().then(setPermission);
  }, []);

  const check = useCallback(async (): Promise<LocationState> => {
    if (!branch) return { status: "idle" };
    setState({ status: "checking" });
    let next: LocationState;
    try {
      const mode = dev?.settings().location ?? "real";
      let proof: LocationProof;
      if (mode === "real") {
        proof = await readPosition();
      } else if (mode === "blocked") {
        throw new GeoError("denied");
      } else {
        const metres = mode === "too_far" ? 3200 : 40;
        proof = {
          lat: branch.location.lat + metres / METRES_PER_DEG,
          lng: branch.location.lng,
          accuracyM: mode === "inaccurate" ? 420 : 18,
          capturedAt: clock.now(),
        };
      }
      next = { status: "ready", proof, result: evaluateProximity(proof, branch, clock.now()) };
    } catch (e) {
      next = { status: "failed", reason: e instanceof GeoError ? e.reason : "unavailable" };
    }
    setState(next);
    void geoPermission().then(setPermission);
    return next;
  }, [branch, dev]);

  return { state, permission, check };
}
