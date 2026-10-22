"use client";
import { useSyncExternalStore } from "react";
import type { LocationProof, PriorityTag } from "@/domain";
import { session } from "@/lib/storage";

/**
 * What the customer has chosen so far on the way to a token. Lives in sessionStorage so a refresh
 * keeps it, and so it is gone when the tab closes (the location proof is sensitive and short lived).
 */
export interface JoinDraft {
  branchId: string | null;
  bankSlug: string | null;
  branchSlug: string | null;
  branchName: string | null;
  proof: LocationProof | null;
  serviceId: string | null;
  serviceName: string | null;
  priority: PriorityTag[];
  /** True once the customer changed priority on the review screen this visit. */
  priorityTouched: boolean;
  /** Set when the draft was started from a booking check-in. */
  bookingId: string | null;
}

export const EMPTY_DRAFT: JoinDraft = {
  branchId: null, bankSlug: null, branchSlug: null, branchName: null, proof: null,
  serviceId: null, serviceName: null, priority: [], priorityTouched: false, bookingId: null,
};

const KEY = "qbit9.joinDraft";
let cache: JoinDraft | null = null;
const listeners = new Set<() => void>();

function load(): JoinDraft {
  if (!cache) cache = { ...EMPTY_DRAFT, ...session.read<Partial<JoinDraft>>(KEY, {}) };
  return cache;
}

export function setDraft(patch: Partial<JoinDraft>): void {
  cache = { ...load(), ...patch };
  session.write(KEY, cache);
  listeners.forEach((l) => l());
}

export function clearDraft(): void {
  cache = { ...EMPTY_DRAFT };
  session.remove(KEY);
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useJoinDraft(): JoinDraft {
  return useSyncExternalStore(subscribe, load, () => EMPTY_DRAFT);
}
