"use client";
import { useSyncExternalStore } from "react";
import { onKeyChange, readJson, writeJson } from "./storage";

/** A tiny persisted value with a React hook. Stable snapshots, cross-tab updates, never throws. */
export function createLocalStore<T>(key: string, fallback: T) {
  let cacheStr = JSON.stringify(fallback);
  let cache: T = fallback;
  const read = (): T => {
    const v = readJson<T>(key, fallback);
    const s = JSON.stringify(v);
    if (s !== cacheStr) {
      cacheStr = s;
      cache = v;
    }
    return cache;
  };
  const subscribe = (cb: () => void) => onKeyChange(key, cb);
  return {
    get: read,
    set: (v: T) => writeJson(key, v),
    use: () => useSyncExternalStore(subscribe, read, () => fallback),
  };
}
