/** One place for TanStack Query keys so invalidation never misses a spelling. */
export const keys = {
  session: ["session"] as const,
  branches: ["branches"] as const,
  branch: (bank: string, slug: string) => ["branch", bank, slug] as const,
  branchById: (id: string) => ["branch-id", id] as const,
  snapshot: (id: string) => ["snapshot", id] as const,
  catalogue: (id: string) => ["catalogue", id] as const,
  active: ["active-token"] as const,
  token: (code: string) => ["token", code] as const,
  tokens: ["token"] as const,
  bookings: ["bookings"] as const,
  availability: (branchId: string, serviceId: string) => ["availability", branchId, serviceId] as const,
  history: ["history"] as const,
  prefs: ["prefs"] as const,
};
