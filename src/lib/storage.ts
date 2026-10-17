/**
 * Small JSON store over localStorage that never throws. Private windows, blocked storage and SSR
 * fall back to memory so the app keeps working for the session instead of crashing.
 */
const memory = new Map<string, string>();
const CHANGE_EVENT = "qbit9:storage";

function ls(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const k = "__qbit9_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(key) ?? memory.get(key) ?? null;
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  try {
    const store = ls();
    if (store) store.setItem(key, raw);
    else memory.set(key, raw);
  } catch {
    memory.set(key, raw);
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

export function removeKey(key: string): void {
  try {
    ls()?.removeItem(key);
  } catch {
    /* ignore */
  }
  memory.delete(key);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

/** Notified when `key` changes in this tab or any other. Returns an unsubscribe function. */
export function onKeyChange(key: string, fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const local = (e: Event) => {
    if ((e as CustomEvent<string>).detail === key) fn();
  };
  const cross = (e: StorageEvent) => {
    if (e.key === key || e.key === null) fn();
  };
  window.addEventListener(CHANGE_EVENT, local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener(CHANGE_EVENT, local);
    window.removeEventListener("storage", cross);
  };
}

/** sessionStorage variant for per-tab drafts (the join flow). Same never-throw contract. */
export const session = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  write<T>(key: string, value: T): void {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
