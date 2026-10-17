"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False during server render and hydration, true afterwards. Avoids setState-in-effect for "mounted". */
export const useIsClient = (): boolean => useSyncExternalStore(noop, () => true, () => false);
