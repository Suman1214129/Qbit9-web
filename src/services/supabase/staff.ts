import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DomainError,
  STAFF_POLICY,
  formatTokenCode,
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

export function createStaffService(client?: SupabaseClient): StaffService {
  const sb = client ?? getSupabaseClient();

  const requireStaffSession = (): StaffSessionStorage => {
    const now = clock.now();
    if (!staffSessionCache || staffSessionCache.expiresAt <= now) {
      staffSessionCache = null;
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

  const buildCounterState = async (session: StaffSessionStorage): Promise<CounterState> => {
    const now = clock.now();
    const branch = await getBranch(session.staff.branchId);

    const counterNumber = session.counter ?? 1;
    const counterOption: CounterOption = {
      number: counterNumber,
      groupIds: ["grp_cash", "grp_accounts"],
      serviceNames: ["Cash deposit or withdrawal", "Open an account"],
      takenBy: session.staff.name,
      onBreak: session.shiftStatus === "break",
    };

    return {
      staff: session.staff,
      branch,
      counter: counterOption,
      shift: toShiftState(session, now),
      now,
      waitingMine: 2,
      served: 5,
      avgServiceMs: 6 * 60_000,
      current: null,
      held: [],
      next: [],
      nextCallable: null,
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
      const now = clock.now();
      if (!staffSessionCache || staffSessionCache.expiresAt <= now) {
        staffSessionCache = null;
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

        return { staff: member, expiresAt };
      } catch (err) {
        throw toDomainError(err);
      }
    },

    async signOut(): Promise<void> {
      staffSessionCache = null;
    },

    async roster(): Promise<Roster> {
      const session = requireStaffSession();
      const branch = await getBranch(session.staff.branchId);
      const now = clock.now();

      const assigned: CounterOption = {
        number: session.counter ?? 1,
        groupIds: ["grp_cash"],
        serviceNames: ["Cash and cheques"],
        takenBy: session.counter ? session.staff.name : null,
        onBreak: session.shiftStatus === "break",
      };

      return {
        staff: session.staff,
        branch,
        dateKey: new Date(now).toISOString().split("T")[0] ?? "",
        assigned,
        shiftStart: "10:00",
        shiftEnd: "16:00",
        shift: toShiftState(session, now),
        counters: [assigned],
        countersOpen: session.counter ? 1 : 0,
        countersTotal: 4,
        waiting: 3,
        lastShift: null,
      };
    },

    async startShift(counter?: number): Promise<CounterState> {
      const session = requireStaffSession();
      session.counter = counter ?? session.counter ?? 1;
      session.shiftStatus = "open";
      session.breakReason = null;
      session.breakStartedAt = null;
      return buildCounterState(session);
    },

    async startBreak(reason: BreakReason): Promise<CounterState> {
      const session = requireStaffSession();
      if (session.shiftStatus !== "open") throw new DomainError("shift_not_started");
      session.shiftStatus = "break";
      session.breakReason = reason;
      session.breakStartedAt = clock.now();
      return buildCounterState(session);
    },

    async resumeFromBreak(): Promise<CounterState> {
      const session = requireStaffSession();
      session.shiftStatus = "open";
      session.breakReason = null;
      session.breakStartedAt = null;
      return buildCounterState(session);
    },

    async endShift(): Promise<Roster> {
      const session = requireStaffSession();
      session.shiftStatus = "ended";
      session.counter = null;
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
      const myGroupIds = ["grp_cash", "grp_teller", "grp_advisor"];

      try {
        const { data: rows } = await sb
          .from("staff_queue")
          .select("*")
          .eq("branch_id", session.staff.branchId)
          .order("order_at", { ascending: true });

        const allEntries: QueueEntry[] = (rows ?? []).map((r: Record<string, unknown>) => ({
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
          counter: r.counter ? Number(r.counter) : null,
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
        }));

        const waiting = allEntries.filter((e) => e.status === "waiting");
        const atCounters = allEntries.filter((e) => e.counter !== null && !e.closedAt);

        return {
          scope,
          now,
          groupIds: myGroupIds,
          counter: session.counter,
          waiting,
          atCounters,
          mineCount: waiting.filter((e) => myGroupIds.includes(e.groupId)).length,
          allCount: waiting.length,
          longestWaitMin: waiting.length > 0 && waiting[0] ? Math.round((now - waiting[0].joinedAt) / 60_000) : null,
          myGroupIds,
          hasCurrent: atCounters.some((e) => e.counter === session.counter),
        };
      } catch {
        return {
          scope,
          now,
          groupIds: myGroupIds,
          counter: session.counter,
          waiting: [],
          atCounters: [],
          mineCount: 0,
          allCount: 0,
          longestWaitMin: null,
          myGroupIds,
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
      const _session = requireStaffSession();
      const now = clock.now();

      const entry: QueueEntry = {
        id: `walk_${now}`,
        code: formatTokenCode("C", 45),
        number: 45,
        name: input.name || null,
        serviceId: input.serviceId,
        serviceName: "Walk-in service",
        groupId: "grp_cash",
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
        avgServiceMin: 6,
      };

      return {
        entry,
        ahead: 0,
        estWait: { minMin: 0, maxMin: 0 },
      };
    },

    async walkInServices() {
      return [
        {
          groupId: "grp_cash",
          groupName: "Cash and cheques",
          services: [{ id: "svc_cash", name: "Cash deposit or withdrawal" }],
        },
      ];
    },

    async today(): Promise<TodayState> {
      const session = requireStaffSession();
      const branch = await getBranch(session.staff.branchId);
      const now = clock.now();

      return {
        staff: session.staff,
        branch,
        counter: session.counter,
        shift: toShiftState(session, now),
        now,
        summary: {
          served: 5,
          noShows: 1,
          avgServiceMs: 6 * 60_000,
          hourly: [],
        },
        autoClosed: [],
        hasCurrent: false,
        waitingMine: 0,
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
