import { monthLong, tzParts } from "./time";
import type { Booking, HistoryItem, HistoryStats, HistoryStatus, TokenRecord } from "./types";

export interface HistoryLookup {
  branchName: (branchId: string) => string;
  serviceName: (serviceId: string) => string;
  timezone: string;
  /** Saved-time estimate in whole minutes for a token, or null if unknown. */
  savedMin: (t: TokenRecord) => number | null;
}

function tokenStatus(t: TokenRecord): HistoryStatus {
  if (t.servedAt != null) return "served";
  if (t.leftAt != null) return "left";
  if (t.missedAt != null) return "missed";
  return "active";
}

function bookingStatus(b: Booking): HistoryStatus {
  switch (b.status) {
    case "completed": return "served";
    case "cancelled": return "cancelled";
    case "missed": return "missed";
    default: return "upcoming";
  }
}

/** Merge tokens and bookings into one timeline, newest first. A booking that became a token appears once. */
export function buildHistory(tokens: TokenRecord[], bookings: Booking[], lookup: HistoryLookup): HistoryItem[] {
  const tokenIdsFromBookings = new Set(bookings.map((b) => b.tokenId).filter((x): x is string => x != null));
  const items: HistoryItem[] = [];

  for (const t of tokens) {
    const status = tokenStatus(t);
    const waitedMin = t.calledAt != null ? Math.max(0, Math.round((t.calledAt - t.joinedAt) / 60_000)) : null;
    items.push({
      id: `t_${t.id}`,
      kind: "token",
      refId: t.id,
      title: lookup.serviceName(t.serviceId),
      branchName: lookup.branchName(t.branchId),
      code: t.code,
      at: t.joinedAt,
      status,
      waitedMin: status === "served" ? waitedMin : null,
      savedMin: status === "served" ? lookup.savedMin(t) : null,
    });
  }

  for (const b of bookings) {
    if (b.tokenId && tokenIdsFromBookings.has(b.tokenId) && tokens.some((t) => t.id === b.tokenId)) continue;
    items.push({
      id: `b_${b.id}`,
      kind: "booking",
      refId: b.id,
      title: lookup.serviceName(b.serviceId),
      branchName: lookup.branchName(b.branchId),
      code: null,
      at: b.startsAt,
      status: bookingStatus(b),
      waitedMin: null,
      savedMin: null,
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

export function historyStats(items: HistoryItem[]): HistoryStats {
  const served = items.filter((i) => i.status === "served");
  const waits = served.map((i) => i.waitedMin).filter((x): x is number => x != null);
  return {
    visits: served.length,
    averageWaitMin: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
    savedMin: served.reduce((sum, i) => sum + (i.savedMin ?? 0), 0),
  };
}

export interface HistoryMonth {
  key: string; // YYYY-MM
  label: string; // "October"
  items: HistoryItem[];
}

export function groupByMonth(items: HistoryItem[], tz: string): HistoryMonth[] {
  const groups = new Map<string, HistoryMonth>();
  for (const item of items) {
    const p = tzParts(item.at, tz);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, label: monthLong(p.month), items: [] };
      groups.set(key, g);
    }
    g.items.push(item);
  }
  return [...groups.values()];
}
