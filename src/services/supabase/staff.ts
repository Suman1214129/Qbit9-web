import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DomainError,
  STAFF_POLICY,
  estimateWait,
  pickNext,
  type BreakReason,
  type EpochMs,
  type ID,
  type PriorityTag,
  type QueueEntry,
  type ShiftState,
  type ShiftStatus,
  type StaffMember,
  type StaffSession,
} from "@/domain";
import { clock } from "@/lib/clock";
import type {
  CallOptions,
  CounterOption,
  CounterState,
  QueueScope,
  QueueState,
  Roster,
  StaffCapabilities,
  StaffLoginInput,
  StaffService,
  TodayState,
  WalkInResult,
} from "../staff-types";
import { getSupabaseClient } from "./client";
import { toDomainError } from "./queue";

interface StaffSessionStorage {
  staff: StaffMember;
  expiresAt: EpochMs;
  counter: number | null;
  shiftStatus: ShiftStatus;
  breakReason: BreakReason | null;
  breakStartedAt: EpochMs | null;
}

let staffSessionCache: StaffSessionStorage | null = null;

const SESSION_KEY = "qbit9.staff.session.v1";

function persistSession(s: StaffSessionStorage | null): void {
  if (typeof window === "undefined") return;
  if (s === null) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch { /* storage full or private mode */ }
  }
}

function restoreSession(): void {
  if (typeof window === "undefined" || staffSessionCache) return;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StaffSessionStorage;
    if (parsed.expiresAt > Date.now()) {
      staffSessionCache = parsed;
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch { /* corrupted data */ }
}

export function createStaffService(client?: SupabaseClient): StaffService {
  const sb = client ?? getSupabaseClient();

  // Restore session from localStorage on every service creation (page load/reload)
  restoreSession();

  const requireStaffSession = (): StaffSessionStorage => {
    const now = clock.now();
    if (!staffSessionCache || staffSessionCache.expiresAt <= now) {
      staffSessionCache = null;
      persistSession(null);
      throw new DomainError("not_signed_in");
    }
    return staffSessionCache;
  };

  const getBranch = async (branchId: ID) => {
    const { data, error } = await sb.from("branches").select("*, banks(name, short_name)").eq("id", branchId).maybeSingle();
    if (error || !data) throw new DomainError("branch_not_found");
    return {
      id: String(data.id),
      name: String(data.name),
      bankName: String((data.banks as Record<string, unknown> | null)?.name ?? "Bank"),
      bankShort: String((data.banks as Record<string, unknown> | null)?.short_name ?? "Bank"),
      timezone: String(data.timezone ?? "Asia/Kolkata"),
    };
  };

  const toShiftState = (session: StaffSessionStorage, now: EpochMs): ShiftState => ({
    status: session.shiftStatus,
    counter: session.counter,
    startedAt: now,
    endedAt: session.shiftStatus === "ended" ? now : null,
    breakReason: session.breakReason,
    breakStartedAt: session.breakStartedAt,
    callNextPresses: 0,
    nudgeSnoozedUntil: null,
  });

  const rowToEntry = (r: Record<string, unknown>): QueueEntry => ({
    id: String(r.id),
    code: String(r.code),
    number: Number(r.number),
    name: r.name ? String(r.name) : null,
    serviceId: String(r.service_id),
    serviceName: String(r.service_name),
    groupId: String(r.group_id),
    origin: r.origin === "booking" ? "booking" : r.origin === "app" ? "app" : "counter",
    live: Boolean(r.live),
    priority: Array.isArray(r.priority) ? r.priority : [],
    joinedAt: Number(r.joined_at),
    orderAt: Number(r.order_at),
    status: (r.status as QueueEntry["status"]) || "waiting",
    held: Boolean(r.held),
    counter: r.counter != null ? Number(r.counter) : null,
    calledAt: r.called_at ? Number(r.called_at) : null,
    arrivedAt: r.arrived_at ? Number(r.arrived_at) : null,
    replied: Boolean(r.replied),
    callDeadline: r.call_deadline ? Number(r.call_deadline) : null,
    confirming: Boolean(r.confirming),
    note: r.note ? String(r.note) : null,
    recalls: Number(r.recalls || 0),
    closedAt: r.closed_at ? Number(r.closed_at) : null,
    closedBy: r.closed_by === "staff" || r.closed_by === "auto" ? r.closed_by : null,
    avgServiceMin: Number(r.avg_service_min || 6),
  });

  const getCounterGroupIds = async (branchId: ID, counterNumber: number): Promise<string[]> => {
    try {
      const { data } = await sb
        .from("counters")
        .select("id, counter_groups(group_id)")
        .eq("branch_id", branchId)
        .eq("number", counterNumber)
        .maybeSingle();
      if (!data) return [];
      const cgs = (data as Record<string, unknown>).counter_groups;
      return Array.isArray(cgs) ? cgs.map((g: Record<string, unknown>) => String(g.group_id)) : [];
    } catch {
      return [];
    }
  };

  const getAllBranchGroupIds = async (branchId: ID): Promise<string[]> => {
    try {
      const { data } = await sb
        .from("service_groups")
        .select("id")
        .eq("branch_id", branchId);
      return (data ?? []).map((g: Record<string, unknown>) => String(g.id));
    } catch {
      return [];
    }
  };

  const buildCounterState = async (session: StaffSessionStorage): Promise<CounterState> => {
    const now = clock.now();
    const branch = await getBranch(session.staff.branchId);
    const todayIso = new Date(now).toISOString().split("T")[0];
    const counterNumber = session.counter ?? 1;

    // Fetch real group IDs for this counter from DB
    const groupIds = await getCounterGroupIds(session.staff.branchId, counterNumber);
    // Fall back to ALL branch groups (not hardcoded strings) so nothing is filtered out
    const myGroupIds = groupIds.length ? groupIds : await getAllBranchGroupIds(session.staff.branchId);

    // Fetch service names for the counter option
    let serviceNames: string[] = [];
    if (myGroupIds.length) {
      try {
        const { data: svcs } = await sb
          .from("services")
          .select("name, group_id")
          .in("group_id", myGroupIds);
        serviceNames = (svcs ?? []).map((s: Record<string, unknown>) => String(s.name));
      } catch { /* default empty */ }
    }

    const counterOption: CounterOption = {
      number: counterNumber,
      groupIds: myGroupIds,
      serviceNames,
      takenBy: session.staff.name,
      onBreak: session.shiftStatus === "break",
    };

    // Fetch all live queue entries for this branch today
    let allEntries: QueueEntry[] = [];
    try {
      const { data: rows } = await sb
        .from("staff_queue")
        .select("*")
        .eq("branch_id", session.staff.branchId)
        .eq("day", todayIso)
        .order("order_at", { ascending: true });
      allEntries = (rows ?? []).map((r: Record<string, unknown>) => rowToEntry(r));
    } catch { /* default empty */ }

    const waiting = allEntries.filter((e) => e.status === "waiting" && myGroupIds.includes(e.groupId));
    const atCounter = allEntries.filter((e) => e.counter === counterNumber && (e.status === "called" || e.status === "serving"));
    const current = atCounter.find((e) => !e.held) ?? null;
    const held = atCounter.filter((e) => e.held);
    const next = waiting.slice(0, 4);
    const nextCallable = pickNext(waiting, myGroupIds);

    // Served count for today at this counter
    let served = 0;
    let avgServiceMs: number | null = null;
    try {
      const { data: closedRows } = await sb
        .from("staff_queue")
        .select("status, arrived_at, closed_at")
        .eq("branch_id", session.staff.branchId)
        .eq("counter", counterNumber)
        .eq("day", todayIso)
        .eq("status", "served");
      served = (closedRows ?? []).length;
      const times = (closedRows ?? [])
        .filter((r: Record<string, unknown>) => r.arrived_at && r.closed_at)
        .map((r: Record<string, unknown>) => Number(r.closed_at) - Number(r.arrived_at));
      if (times.length) avgServiceMs = times.reduce((a: number, b: number) => a + b, 0) / times.length;
    } catch { /* default 0 */ }

    return {
      staff: session.staff,
      branch,
      counter: counterOption,
      shift: toShiftState(session, now),
      now,
      waitingMine: waiting.length,
      served,
      avgServiceMs,
      current,
      held,
      next,
      nextCallable,
      nudge: false,
      onBreak: session.shiftStatus === "break" && session.breakReason && session.breakStartedAt
        ? { reason: session.breakReason, startedAt: session.breakStartedAt, impactMin: 5 }
        : null,
      transferTargets: [],
    };
  };

  return {
    capabilities(): StaffCapabilities {
      return { passkey: false };
    },

    async getSession(): Promise<StaffSession | null> {
      // Always try to restore from localStorage first (handles page reload case)
      restoreSession();
      const now = clock.now();
      if (!staffSessionCache || staffSessionCache.expiresAt <= now) {
        staffSessionCache = null;
        persistSession(null);
        return null;
      }
      return {
        staff: staffSessionCache.staff,
        expiresAt: staffSessionCache.expiresAt,
      };
    },

    async signIn(input: StaffLoginInput): Promise<StaffSession> {
      try {
        const { data, error } = await sb.rpc("staff_sign_in", {
          p_employee_id: input.employeeId,
          p_pin: input.pin,
        });

        if (error) throw toDomainError(error);

        const member: StaffMember = {
          id: String(data.id),
          employeeId: String(data.employee_id),
          name: String(data.name),
          branchId: String(data.branch_id),
          role: data.role === "admin" ? "admin" : "teller",
        };

        const now = clock.now();
        const expiresAt = now + STAFF_POLICY.sessionMs;
        staffSessionCache = {
          staff: member,
          expiresAt,
          counter: null,
          shiftStatus: "idle",
          breakReason: null,
          breakStartedAt: null,
        };
        persistSession(staffSessionCache);

        return { staff: member, expiresAt };
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async signOut(): Promise<void> {
      staffSessionCache = null;
      persistSession(null);
    },

    async roster(): Promise<Roster> {
      const session = requireStaffSession();
      const branch = await getBranch(session.staff.branchId);
      const now = clock.now();
      const todayIso = new Date(now).toISOString().split("T")[0] ?? "";

      let waiting = 0;
      let countersTotal = 4;
      try {
        const { count: wCount } = await sb
          .from("tokens")
          .select("*", { count: "exact", head: true })
          .eq("branch_id", session.staff.branchId)
          .is("served_at", null)
          .is("missed_at", null)
          .is("left_at", null)
          .gte("created_at", `${todayIso}T00:00:00Z`);
        waiting = wCount ?? 0;

        const { count: cCount } = await sb
          .from("counters")
          .select("*", { count: "exact", head: true })
          .eq("branch_id", session.staff.branchId);
        if (cCount) countersTotal = cCount;
      } catch {
        // default 0
      }

      // Get real counter group IDs (no hardcoded fallback)
      const counterNumber = session.counter ?? 1;
      const counterGroupIds = await getCounterGroupIds(session.staff.branchId, counterNumber);
      const effectiveGroupIds = counterGroupIds.length ? counterGroupIds : await getAllBranchGroupIds(session.staff.branchId);
      let serviceNames: string[] = [];
      if (effectiveGroupIds.length) {
        try {
          const { data: svcs } = await sb.from("services").select("name").in("group_id", effectiveGroupIds);
          serviceNames = (svcs ?? []).map((s: Record<string, unknown>) => String(s.name));
        } catch { /* default */ }
      }

      const assigned: CounterOption = {
        number: counterNumber,
        groupIds: effectiveGroupIds,
        serviceNames,
        takenBy: session.counter ? session.staff.name : null,
        onBreak: session.shiftStatus === "break",
      };

      return {
        staff: session.staff,
        branch,
        dateKey: todayIso,
        assigned,
        shiftStart: "10:00",
        shiftEnd: "16:00",
        shift: toShiftState(session, now),
        counters: [assigned],
        countersOpen: session.counter ? 1 : 0,
        countersTotal,
        waiting,
        lastShift: null,
      };
    },

    async startShift(counter?: number): Promise<CounterState> {
      const session = requireStaffSession();
      session.counter = counter ?? session.counter ?? 1;
      session.shiftStatus = "open";
      session.breakReason = null;
      session.breakStartedAt = null;
      persistSession(session);
      return buildCounterState(session);
    },

    async startBreak(reason: BreakReason): Promise<CounterState> {
      const session = requireStaffSession();
      if (session.shiftStatus !== "open") throw new DomainError("shift_not_started");
      session.shiftStatus = "break";
      session.breakReason = reason;
      session.breakStartedAt = clock.now();
      persistSession(session);
      return buildCounterState(session);
    },

    async resumeFromBreak(): Promise<CounterState> {
      const session = requireStaffSession();
      session.shiftStatus = "open";
      session.breakReason = null;
      session.breakStartedAt = null;
      persistSession(session);
      return buildCounterState(session);
    },

    async endShift(): Promise<Roster> {
      const session = requireStaffSession();
      session.shiftStatus = "ended";
      session.counter = null;
      persistSession(session);
      return this.roster();
    },

    async counter(): Promise<CounterState> {
      const session = requireStaffSession();
      return buildCounterState(session);
    },

    async callNext(opts?: CallOptions): Promise<CounterState> {
      const session = requireStaffSession();
      if (!session.counter) throw new DomainError("shift_not_started");

      const { error } = await sb.rpc("staff_call_next", {
        p_staff_id: session.staff.id,
        p_counter: session.counter,
        p_entry_id: opts?.entryId ?? null,
        p_close_current_as: opts?.closeCurrentAs ?? "served",
      });

      if (error) throw toDomainError(error);
      return buildCounterState(session);
    },

    async finishCurrent(as?: "served" | "no_show"): Promise<CounterState> {
      const session = requireStaffSession();
      if (!session.counter) throw new DomainError("shift_not_started");

      const { error } = await sb.rpc("staff_finish_current", {
        p_staff_id: session.staff.id,
        p_counter: session.counter,
        p_as: as ?? "served",
      });

      if (error) throw toDomainError(error);
      return buildCounterState(session);
    },

    async recall(): Promise<CounterState> {
      const session = requireStaffSession();
      if (!session.counter) throw new DomainError("shift_not_started");

      const { error } = await sb.rpc("staff_recall", {
        p_staff_id: session.staff.id,
        p_counter: session.counter,
      });

      if (error) throw toDomainError(error);
      return buildCounterState(session);
    },

    async transfer(toCounter: number): Promise<CounterState> {
      const session = requireStaffSession();
      if (!session.counter) throw new DomainError("shift_not_started");

      const { error } = await sb.rpc("staff_transfer", {
        p_staff_id: session.staff.id,
        p_from_counter: session.counter,
        p_to_counter: toCounter,
      });

      if (error) throw toDomainError(error);
      return buildCounterState(session);
    },

    async hold(): Promise<CounterState> {
      const session = requireStaffSession();
      return buildCounterState(session);
    },

    async resume(_entryId: ID): Promise<CounterState> {
      const session = requireStaffSession();
      return buildCounterState(session);
    },

    async setNote(note: string): Promise<CounterState> {
      const session = requireStaffSession();
      if (session.counter) {
        await sb
          .from("tokens")
          .update({ note: note.slice(0, 140) })
          .eq("branch_id", session.staff.branchId)
          .eq("counter", session.counter)
          .is("served_at", null)
          .is("missed_at", null);
      }
      return buildCounterState(session);
    },

    async snoozeNudge(): Promise<CounterState> {
      const session = requireStaffSession();
      return buildCounterState(session);
    },

    async queue(scope: QueueScope): Promise<QueueState> {
      const session = requireStaffSession();
      const now = clock.now();
      const todayIso = new Date(now).toISOString().split("T")[0];
      const counterNumber = session.counter ?? 1;
      const counterGroupIds = await getCounterGroupIds(session.staff.branchId, counterNumber);
      // Fall back to all branch groups — never hardcode group IDs
      const effectiveGroupIds = counterGroupIds.length
        ? counterGroupIds
        : await getAllBranchGroupIds(session.staff.branchId);

      try {
        const { data: rows } = await sb
          .from("staff_queue")
          .select("*")
          .eq("branch_id", session.staff.branchId)
          .eq("day", todayIso)
          .order("order_at", { ascending: true });

        const allEntries: QueueEntry[] = (rows ?? []).map((r: Record<string, unknown>) => rowToEntry(r));
        const waiting = allEntries.filter((e) => e.status === "waiting");
        const atCounters = allEntries.filter((e) => e.counter !== null && !e.closedAt);
        const shown = scope === "mine" ? waiting.filter((e) => effectiveGroupIds.includes(e.groupId)) : waiting;

        return {
          scope,
          now,
          groupIds: scope === "mine" ? effectiveGroupIds : [...new Set(allEntries.map((e) => e.groupId))],
          counter: session.counter,
          waiting: shown,
          atCounters,
          mineCount: waiting.filter((e) => effectiveGroupIds.includes(e.groupId)).length,
          allCount: waiting.length,
          longestWaitMin: shown.length > 0 && shown[0] ? Math.round((now - shown[0].joinedAt) / 60_000) : null,
          myGroupIds: effectiveGroupIds,
          hasCurrent: atCounters.some((e) => e.counter === session.counter),
        };
      } catch {
        return {
          scope,
          now,
          groupIds: effectiveGroupIds,
          counter: session.counter,
          waiting: [],
          atCounters: [],
          mineCount: 0,
          allCount: 0,
          longestWaitMin: null,
          myGroupIds: effectiveGroupIds,
          hasCurrent: false,
        };
      }
    },

    async issueWalkIn(input: {
      name: string;
      phone: string;
      serviceId: ID;
      priority: PriorityTag[];
    }): Promise<WalkInResult> {
      const session = requireStaffSession();
      try {
        const { data, error } = await sb.rpc("staff_issue_walk_in", {
          p_staff_id: session.staff.id,
          p_counter: session.counter ?? 1,
          p_service_id: input.serviceId,
          p_name: input.name || null,
          p_phone: input.phone || null,
          p_priority: input.priority,
        });
        if (error) throw toDomainError(error);
        const now = clock.now();
        const entry: QueueEntry = {
          id: String(data.id),
          code: String(data.code),
          number: Number(data.number),
          name: input.name || null,
          serviceId: input.serviceId,
          serviceName: String(data.service_name ?? "Walk-in"),
          groupId: String(data.group_id),
          origin: "counter",
          live: false,
          priority: input.priority,
          joinedAt: now,
          orderAt: now,
          status: "waiting",
          held: false,
          counter: null,
          calledAt: null,
          arrivedAt: null,
          replied: false,
          callDeadline: null,
          confirming: false,
          note: null,
          recalls: 0,
          closedAt: null,
          closedBy: null,
          avgServiceMin: Number(data.avg_service_min ?? 6),
        };
        return { entry, ahead: Number(data.ahead ?? 0), estWait: estimateWait(Number(data.ahead ?? 0), entry.avgServiceMin, 1) };
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async walkInServices() {
      const session = requireStaffSession();
      try {
        const groupIds = await getCounterGroupIds(session.staff.branchId, session.counter ?? 1);
        const query = sb.from("services").select("id, name, avg_service_min, group_id, service_groups(id, name)");
        if (groupIds.length) query.in("group_id", groupIds);
        const { data } = await query;
        const byGroup = new Map<string, { groupId: string; groupName: string; services: { id: string; name: string }[] }>();
        for (const svc of (data ?? []) as Record<string, unknown>[]) {
          const gid = String(svc.group_id);
          const sg = svc.service_groups as Record<string, unknown> | null;
          if (!byGroup.has(gid)) byGroup.set(gid, { groupId: gid, groupName: String(sg?.name ?? gid), services: [] });
          byGroup.get(gid)!.services.push({ id: String(svc.id), name: String(svc.name) });
        }
        return byGroup.size ? Array.from(byGroup.values()) : [{ groupId: "grp_cash", groupName: "Cash and cheques", services: [{ id: "svc_cash", name: "Cash deposit or withdrawal" }] }];
      } catch {
        return [{ groupId: "grp_cash", groupName: "Cash and cheques", services: [{ id: "svc_cash", name: "Cash deposit or withdrawal" }] }];
      }
    },

    async today(): Promise<TodayState> {
      const session = requireStaffSession();
      const branch = await getBranch(session.staff.branchId);
      const now = clock.now();
      const todayIso = new Date(now).toISOString().split("T")[0];
      const counterNumber = session.counter ?? 1;
      const myGroupIds = await getCounterGroupIds(session.staff.branchId, counterNumber);

      let served = 0;
      let noShows = 0;
      let avgServiceMs: number | null = null;
      let autoClosed: QueueEntry[] = [];
      let hasCurrent = false;
      let waitingMine = 0;

      try {
        const { data: rows } = await sb
          .from("staff_queue")
          .select("*")
          .eq("branch_id", session.staff.branchId)
          .eq("day", todayIso)
          .order("order_at", { ascending: true });

        const entries = (rows ?? []).map((r: Record<string, unknown>) => rowToEntry(r));
        served = entries.filter((e) => e.status === "served" && e.counter === counterNumber).length;
        noShows = entries.filter((e) => e.status === "no_show" && e.counter === counterNumber).length;
        waitingMine = entries.filter((e) => e.status === "waiting" && myGroupIds.includes(e.groupId)).length;
        hasCurrent = entries.some((e) => e.counter === counterNumber && (e.status === "called" || e.status === "serving"));
        autoClosed = entries.filter((e) => e.counter === counterNumber && e.status === "no_show" && e.closedBy === "auto");

        const times = entries
          .filter((e) => e.counter === counterNumber && e.status === "served" && e.arrivedAt && e.closedAt)
          .map((e) => (e.closedAt ?? 0) - (e.arrivedAt ?? 0));
        if (times.length) avgServiceMs = times.reduce((a, b) => a + b, 0) / times.length;
      } catch { /* default 0 */ }

      return {
        staff: session.staff,
        branch,
        counter: session.counter,
        shift: toShiftState(session, now),
        now,
        summary: { served, noShows, avgServiceMs, hourly: [] },
        autoClosed,
        hasCurrent,
        waitingMine,
      };
    },

    async undoClosure(_entryId: ID): Promise<TodayState> {
      return this.today();
    },

    subscribe(onChange: () => void): () => void {
      if (typeof window === "undefined") return () => {};
      try {
        const channel = sb
          .channel("staff_queue_realtime")
          .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, () => onChange())
          .subscribe();
        return () => {
          sb.removeChannel(channel);
        };
      } catch {
        return () => {};
      }
    },
  };
}

export const createSupabaseStaffService = createStaffService;
