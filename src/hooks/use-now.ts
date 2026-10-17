"use client";
import { useEffect, useState } from "react";
import { clock } from "@/lib/clock";

/** Current time, re-rendering every `intervalMs`. Uses the app clock so dev time shifts show up. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(clock.now()), intervalMs);
    const off = clock.subscribe(() => setNow(clock.now()));
    return () => {
      window.clearInterval(id);
      off();
    };
  }, [intervalMs]);
  return now;
}
