"use client";
import { useSyncExternalStore } from "react";
import type { OtpChallenge } from "@/services/types";
import { session } from "@/lib/storage";

/** The pending sign-in (which number or email, when a resend is allowed). Per tab, short lived. */
export interface PendingSignIn {
  challenge: OtpChallenge;
  remember: boolean;
  next: string | null;
}

const KEY = "qbit9.pendingSignIn";
let cache: PendingSignIn | null | undefined;
const listeners = new Set<() => void>();

const read = (): PendingSignIn | null => {
  if (cache === undefined) cache = session.read<PendingSignIn | null>(KEY, null);
  return cache;
};

export function setPendingSignIn(v: PendingSignIn | null): void {
  cache = v;
  if (v) session.write(KEY, v);
  else session.remove(KEY);
  listeners.forEach((l) => l());
}

export function usePendingSignIn(): PendingSignIn | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );
}

/** Only allow same-site paths as a post sign-in destination (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}
