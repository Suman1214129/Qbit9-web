import { pluralize } from "@/lib/format";
import type { QueueEntry } from "@/domain";

/** 65_000 -> "1:05". Floors at zero. */
export function clockMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 250_000 -> "4m 10s", 240_000 -> "4m", 45_000 -> "45s". */
export function spokenMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}

export const minutesSince = (from: number, now: number) => Math.max(0, Math.floor((now - from) / 60_000));

export const customerName = (e: Pick<QueueEntry, "name">) => e.name ?? "Customer";

/** "Waiting 14 min", "Waiting less than a minute". */
export function waitingLabel(e: Pick<QueueEntry, "joinedAt">, now: number): string {
  const m = minutesSince(e.joinedAt, now);
  return m < 1 ? "Just joined" : `Waiting ${m} ${pluralize(m, "min", "min")}`;
}

export const PRIORITY_LABEL = { senior_citizen: "Senior citizen", pensioner: "Pensioner", disability: "Disability" } as const;

export const priorityLabel = (e: Pick<QueueEntry, "priority">): string | null => (e.priority.length ? e.priority.map((p) => PRIORITY_LABEL[p]).join(", ") : null);

/** What the call state means in words, as in the mockups ("on the way, replied just now"). */
export function callStatusLabel(e: QueueEntry, now: number): string {
  if (e.status === "serving") return e.held ? "on hold" : "at your counter";
  if (e.status !== "called") return "";
  if (e.replied) return "on the way";
  const calledFor = e.calledAt != null ? now - e.calledAt : 0;
  return calledFor < 20_000 ? "calling now" : "no reply yet";
}
