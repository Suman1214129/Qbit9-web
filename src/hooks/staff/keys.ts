/** TanStack Query keys for the staff app, kept apart from the customer keys. */
export const staffKeys = {
  all: ["staff"] as const,
  session: ["staff", "session"] as const,
  roster: ["staff", "roster"] as const,
  counter: ["staff", "counter"] as const,
  queue: (scope: string) => ["staff", "queue", scope] as const,
  queues: ["staff", "queue"] as const,
  today: ["staff", "today"] as const,
  walkInServices: ["staff", "walk-in-services"] as const,
};
