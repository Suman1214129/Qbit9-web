import { describe, expect, it } from "vitest";
import { assertWithinBranch, bearingDeg, distanceM, evaluateProximity } from "./geo";
import { DomainError } from "./errors";

const branch = { location: { lat: 23.0225, lng: 72.5714 }, joinRadiusM: 200 };
const NOW = 1_800_000_000_000;
const proof = (lat: number, lng: number, accuracyM = 20, capturedAt = NOW) => ({ lat, lng, accuracyM, capturedAt });

describe("distanceM", () => {
  it("is zero for the same point", () => {
    expect(distanceM(branch.location, branch.location)).toBeCloseTo(0, 5);
  });
  it("matches a known short distance (0.001 deg lat is about 111 m)", () => {
    const d = distanceM(branch.location, { lat: 23.0235, lng: 72.5714 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
  it("is symmetric", () => {
    const a = { lat: 12.97, lng: 77.59 };
    const b = { lat: 13.08, lng: 80.27 };
    expect(distanceM(a, b)).toBeCloseTo(distanceM(b, a), 3);
  });
  it("handles the antimeridian", () => {
    expect(distanceM({ lat: 0, lng: 179.9995 }, { lat: 0, lng: -179.9995 })).toBeLessThan(120);
  });
});

describe("bearingDeg", () => {
  it("points north when the target is due north", () => {
    expect(bearingDeg(branch.location, { lat: 24, lng: 72.5714 })).toBeCloseTo(0, 1);
  });
  it("points east when the target is due east", () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 1);
  });
});

describe("evaluateProximity", () => {
  it("is within when inside the radius", () => {
    const r = evaluateProximity(proof(23.0228, 72.5714), branch, NOW);
    expect(r.status).toBe("within");
    expect(r.distanceM).toBeLessThan(50);
    expect(r.shortfallM).toBe(0);
  });
  it("is too far outside the radius and reports the shortfall", () => {
    const r = evaluateProximity(proof(23.0525, 72.5714), branch, NOW);
    expect(r.status).toBe("too_far");
    expect(r.distanceM).toBeGreaterThan(3000);
    expect(r.shortfallM).toBeCloseTo(r.distanceM - 200, 3);
  });
  it("rejects imprecise readings before judging distance", () => {
    expect(evaluateProximity(proof(23.0525, 72.5714, 400), branch, NOW).status).toBe("low_accuracy");
  });
  it("rejects stale readings", () => {
    expect(evaluateProximity(proof(23.0228, 72.5714, 20, NOW - 11 * 60_000), branch, NOW).status).toBe("stale");
  });
  it("rejects readings from the future (clock tampering)", () => {
    expect(evaluateProximity(proof(23.0228, 72.5714, 20, NOW + 5 * 60_000), branch, NOW).status).toBe("stale");
  });
  it("accepts a point exactly on the boundary", () => {
    const edge = { lat: 23.0225 + 199.9 / 111_195, lng: 72.5714 };
    expect(evaluateProximity(proof(edge.lat, edge.lng), branch, NOW).status).toBe("within");
  });
});

describe("assertWithinBranch", () => {
  it("throws location_required without a proof", () => {
    expect(() => assertWithinBranch(null, branch, NOW)).toThrowError(DomainError);
    try {
      assertWithinBranch(undefined, branch, NOW);
    } catch (e) {
      expect((e as DomainError).code).toBe("location_required");
    }
  });
  it("throws too_far with the distance attached", () => {
    try {
      assertWithinBranch(proof(23.0525, 72.5714), branch, NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe("too_far");
      expect(Number((e as DomainError).details?.distanceM)).toBeGreaterThan(3000);
    }
  });
  it("returns the result when within", () => {
    expect(assertWithinBranch(proof(23.0226, 72.5714), branch, NOW).status).toBe("within");
  });
  it("rejects NaN coordinates", () => {
    expect(() => assertWithinBranch(proof(NaN, 72.5), branch, NOW)).toThrowError(DomainError);
  });
});
