import clsx, { type ClassValue } from "clsx";

/** Class name joiner. Thin wrapper so we can swap in tailwind-merge later without touching call sites. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
