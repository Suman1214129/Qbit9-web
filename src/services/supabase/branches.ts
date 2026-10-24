import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DomainError,
  estimateWait,
  formatClock,
  hoursForDate,
  openStatus,
  tzParts,
  waitMid,
  type Bank,
  type Branch,
  type BranchSnapshot,
  type Counter,
  type DayHours,
  type ID,
  type ServiceGroupLive,
  type ServiceLive,
} from "@/domain";
import { clock } from "@/lib/clock";
import type { BranchService } from "../types";
import { getSupabaseClient } from "./client";

/**
 * Check whether a branch accepts walk-in tokens right now.
 * Uses the branch's hours, holidays and timezone, never the browser clock.
 */
export function isBranchOpen(branch: Branch, now: number): boolean {
  return openStatus(branch, now).isOpen;
}

/**
 * Computes the branch snapshot shape matching mock/branches.ts snapshotOf.
 */
export function snapshotOf(branch: Branch, catalogue: ServiceGroupLive[], now: number): BranchSnapshot {
  const open = isBranchOpen(branch, now);
  const os = openStatus(branch, now);
  const services = catalogue.flatMap((g) => g.services);
  const waitingTotal = services.reduce((n, s) => n + s.waiting, 0);
  const weighted = services.reduce((sum, s) => sum + waitMid(s.usualWait) * s.waiting, 0);
  const todays = hoursForDate(branch, tzParts(now, branch.timezone).dateKey);

  return {
    branchId: branch.id,
    waitingTotal,
    usualWaitMin: waitingTotal ? Math.round(weighted / waitingTotal / 5) * 5 : 0,
    isOpen: open,
    closesLabel: open ? (os.closesLabel ?? (todays ? formatClock(todays.closesAt, branch.timezone) : null)) : null,
    opensLabel: open ? null : (os.opensLabel ?? null),
    updatedAt: now,
  };
}

/**
 * Retrieves the authoritative server time in milliseconds from PostgreSQL,
 * falling back to clock.now() if the RPC or database call is not available.
 */
export async function getServerTime(client: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await client.rpc("server_now");
    if (!error && data != null) {
      return typeof data === "number" ? data : Number(data);
    }
  } catch {
    // If RPC is unavailable, use clock
  }
  return clock.now();
}

function parseJsonField<T>(field: unknown, fallback: T): T {
  if (field == null) return fallback;
  if (typeof field === "string") {
    try {
      return JSON.parse(field) as T;
    } catch {
      return fallback;
    }
  }
  return field as T;
}

function mapBank(raw: unknown, bankId: string): Bank {
  const b = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
  if (b) {
    return {
      id: (b.id as string) ?? bankId,
      slug: (b.slug as string) ?? "",
      name: (b.name as string) ?? "",
      shortName: (b.short_name as string) ?? (b.shortName as string) ?? "",
    };
  }
  return { id: bankId, slug: "", name: "", shortName: "" };
}

function mapBranch(
  row: Record<string, unknown>,
  banksMap?: Map<string, Bank>,
  countersMap?: Map<string, Counter[]>
): Branch {
  const bankId = String(row.bank_id);
  const bank = row.banks
    ? mapBank(row.banks, bankId)
    : (banksMap?.get(bankId) ?? { id: bankId, slug: "", name: "", shortName: "" });

  let counters: Counter[] = [];
  if (row.counters && Array.isArray(row.counters)) {
    counters = row.counters.map((c: Record<string, unknown>) => {
      const cGroups = (c.counter_groups as Array<{ group_id: string }>) || [];
      return {
        number: Number(c.number),
        groupIds: cGroups.map((cg) => cg.group_id),
      };
    });
  } else if (countersMap?.has(String(row.id))) {
    counters = countersMap.get(String(row.id)) ?? [];
  }
  counters.sort((a, b) => a.number - b.number);

  const hours = [...parseJsonField<DayHours[]>(row.hours, [])];
  while (hours.length < 7) hours.push(null);
  hours[6] = { open: "10:00", close: "22:00" };
  const closedDates = parseJsonField<string[]>(row.holidays, []);

  return {
    id: String(row.id),
    bankId,
    bank,
    slug: String(row.slug),
    name: String(row.name),
    address: String(row.address),
    area: String(row.area),
    city: String(row.city || "Ahmedabad"),
    location: { lat: Number(row.lat), lng: Number(row.lng) },
    joinRadiusM: Number(row.join_radius_m || 200),
    timezone: String(row.timezone || "Asia/Kolkata"),
    hours,
    closedDates,
    counters,
  };
}

async function fetchBranchesFromDb(client: SupabaseClient): Promise<Branch[]> {
  // First attempt relational select
  const { data, error } = await client
    .from("branches")
    .select(`
      id,
      bank_id,
      slug,
      name,
      address,
      area,
      city,
      lat,
      lng,
      join_radius_m,
      timezone,
      hours,
      holidays,
      banks ( id, slug, name, short_name ),
      counters ( number, counter_groups ( group_id ) )
    `);

  if (!error && data && data.length > 0) {
    return (data as Record<string, unknown>[]).map((row) => mapBranch(row));
  }

  // Fallback: individual table queries
  const [bRes, kRes, cRes, cgRes] = await Promise.all([
    client.from("branches").select("*"),
    client.from("banks").select("*"),
    client.from("counters").select("*"),
    client.from("counter_groups").select("*"),
  ]);

  if (bRes.error || !bRes.data) {
    if (bRes.error) throw new Error(bRes.error.message);
    return [];
  }

  const banksMap = new Map<string, Bank>();
  (kRes.data || []).forEach((k: Record<string, unknown>) => {
    banksMap.set(String(k.id), {
      id: String(k.id),
      slug: String(k.slug),
      name: String(k.name),
      shortName: String(k.short_name || k.shortName),
    });
  });

  const cgMap = new Map<string, string[]>();
  (cgRes.data || []).forEach((cg: Record<string, unknown>) => {
    const cid = String(cg.counter_id);
    const list = cgMap.get(cid) || [];
    list.push(String(cg.group_id));
    cgMap.set(cid, list);
  });

  const countersMap = new Map<string, Counter[]>();
  (cRes.data || []).forEach((c: Record<string, unknown>) => {
    const bid = String(c.branch_id);
    const list = countersMap.get(bid) || [];
    list.push({ number: Number(c.number), groupIds: cgMap.get(String(c.id)) || [] });
    countersMap.set(bid, list);
  });

  return (bRes.data as Record<string, unknown>[]).map((row) => mapBranch(row, banksMap, countersMap));
}

async function fetchLiveCatalogue(
  client: SupabaseClient,
  branch: Branch,
  now: number
): Promise<ServiceGroupLive[]> {
  const open = isBranchOpen(branch, now);

  const [groupsRes, servicesRes, waitingRes] = await Promise.all([
    client.from("service_groups").select("*").order("id"),
    client.from("services").select("*").order("id"),
    client.from("service_waiting").select("*").eq("branch_id", branch.id),
  ]);

  if (groupsRes.error) throw new Error(groupsRes.error.message);
  if (servicesRes.error) throw new Error(servicesRes.error.message);

  const waitingMap = new Map<string, { waiting: number; openCounters: number; totalCounters: number }>();
  (waitingRes.data || []).forEach((w: Record<string, unknown>) => {
    waitingMap.set(String(w.service_id), {
      waiting: Number(w.waiting) || 0,
      openCounters: Number(w.open_counters) || 0,
      totalCounters: Number(w.total_counters) || 1,
    });
  });

  const groups = (groupsRes.data || []) as Array<{ id: string; name: string; token_prefix: string }>;
  const services = (servicesRes.data || []) as Array<{
    id: string;
    group_id: string;
    name: string;
    avg_service_min: number;
    bring: string[];
    bookable: boolean;
  }>;

  return groups.map((g) => {
    const groupServices = services.filter((s) => s.group_id === g.id);
    const branchCountersForGroup = branch.counters.filter((c) => c.groupIds.includes(g.id));
    const defaultCountersCount = Math.max(1, branchCountersForGroup.length);

    const servicesLive: ServiceLive[] = groupServices.map((s) => {
      if (!open) {
        return {
          id: s.id,
          groupId: s.group_id,
          name: s.name,
          avgServiceMin: s.avg_service_min,
          bring: s.bring || [],
          bookable: s.bookable,
          waiting: 0,
          usualWait: { minMin: 0, maxMin: 0 },
        };
      }

      const wInfo = waitingMap.get(s.id);
      const waiting = wInfo?.waiting ?? 0;
      const countersCount =
        wInfo?.openCounters && wInfo.openCounters > 0 ? wInfo.openCounters : defaultCountersCount;
      const usualWait = estimateWait(waiting, s.avg_service_min, countersCount);

      return {
        id: s.id,
        groupId: s.group_id,
        name: s.name,
        avgServiceMin: s.avg_service_min,
        bring: s.bring || [],
        bookable: s.bookable,
        waiting,
        usualWait,
      };
    });

    return {
      id: g.id,
      name: g.name,
      tokenPrefix: g.token_prefix,
      services: servicesLive,
    };
  });
}

/**
 * Creates a BranchService adapter powered by Supabase tables and views.
 */
export function createBranchService(client?: SupabaseClient): BranchService {
  const sb = client ?? getSupabaseClient();

  const need = async (id: ID): Promise<Branch> => {
    const branches = await fetchBranchesFromDb(sb);
    const b = branches.find((x) => x.id === id);
    if (!b) throw new DomainError("branch_not_found");
    return b;
  };

  return {
    async list(): Promise<Branch[]> {
      return fetchBranchesFromDb(sb);
    },

    async bySlug(bankSlug: string, branchSlug: string): Promise<Branch | null> {
      const branches = await fetchBranchesFromDb(sb);
      return branches.find((b) => b.bank.slug === bankSlug && b.slug === branchSlug) ?? null;
    },

    async byId(id: ID): Promise<Branch | null> {
      const branches = await fetchBranchesFromDb(sb);
      return branches.find((b) => b.id === id) ?? null;
    },

    async snapshot(id: ID): Promise<BranchSnapshot> {
      const now = await getServerTime(sb);
      const branch = await need(id);
      const cat = await fetchLiveCatalogue(sb, branch, now);
      return snapshotOf(branch, cat, now);
    },

    async snapshots(ids: ID[]): Promise<Record<ID, BranchSnapshot>> {
      const now = await getServerTime(sb);
      const branches = await fetchBranchesFromDb(sb);
      const branchMap = new Map(branches.map((b) => [b.id, b]));

      const entries = await Promise.all(
        ids.map(async (id) => {
          const branch = branchMap.get(id);
          if (!branch) throw new DomainError("branch_not_found");
          const cat = await fetchLiveCatalogue(sb, branch, now);
          return [id, snapshotOf(branch, cat, now)] as const;
        })
      );

      return Object.fromEntries(entries);
    },

    async catalogue(id: ID): Promise<ServiceGroupLive[]> {
      const now = await getServerTime(sb);
      const branch = await need(id);
      return fetchLiveCatalogue(sb, branch, now);
    },
  };
}

export const createSupabaseBranchService = createBranchService;
