/**
 * The one place the app reads the time. Everything (services, hooks, components) calls
 * `clock.now()` so the dev tools can shift time and tests can control it.
 */
let offsetMs = 0;
const listeners = new Set<() => void>();

export const clock = {
  now: (): number => Date.now() + offsetMs,
  offset: (): number => offsetMs,
  setOffset(ms: number) {
    offsetMs = ms;
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
