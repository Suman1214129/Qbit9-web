/**
 * Staff service contract.
 *
 * Same rules as `types.ts`: the UI talks to this interface only. `services/mock/staff/*` implements
 * it over localStorage (sharing the customer mock's data, so a staff "Call next" reaches the
 * customer's token); `services/supabase` will implement it over RPCs and Realtime, see
 * docs/backend-handoff.md ("Staff").
 *
 * Every method is authoritative on the server: check the staff member's session, branch and
 * shift, never trust the screen. Methods that change the queue return the fresh counter state so
 * the screen never has to guess what happened.
 */
import type {
  BreakReason, DaySummary, EpochMs, ID, PriorityTag, QueueEntry, ShiftState, StaffMember, StaffSession, WaitRange,
} from "@/domain";

export interface StaffBranch {
  id: ID;
  name: string;
  bankName: string;
  bankShort: string;
  timezone: string;
}

export interface CounterOption {
  number: number;
  groupIds: ID[];
  /** Plain names of what this counter serves, e.g. "Cash deposit or withdrawal". */
  serviceNames: string[];
  /** Name of the staff member who has it open, or null when free. */
  takenBy: string | null;
  onBreak: boolean;
}

export interface StaffLoginInput {
  employeeId: string;
  pin: string;
}

export interface StaffCapabilities {
  /** Passkey sign in needs the real backend (WebAuthn). The screen hides the button when false. */
  passkey: boolean;
}

/** Start shift screen: what today's roster says, and the branch at a glance. */
export interface Roster {
  staff: StaffMember;
  branch: StaffBranch;
  /** Branch-local date, YYYY-MM-DD. */
  dateKey: string;
  /** The counter the roster assigned. */
  assigned: CounterOption;
  /** Roster hours, branch-local "HH:mm". Informational: nothing locks outside them. */
  shiftStart: string;
  shiftEnd: string;
  shift: ShiftState;
  counters: CounterOption[];
  countersOpen: number;
  countersTotal: number;
  waiting: number;
  /** Served and no-shows from the shift that just ended, shown once on this screen. */
  lastShift: (DaySummary & { endedAt: EpochMs }) | null;
}

export interface BreakInfo {
  reason: BreakReason;
  startedAt: EpochMs;
  /** About how many minutes longer customers wait while this counter is away. */
  impactMin: number;
}

/** Counter screen: ready, serving, nudge and break are all views of this one object. */
export interface CounterState {
  staff: StaffMember;
  branch: StaffBranch;
  counter: CounterOption;
  shift: ShiftState;
  now: EpochMs;
  waitingMine: number;
  served: number;
  avgServiceMs: number | null;
  current: QueueEntry | null;
  held: QueueEntry[];
  /** Next people for this counter in call order (callable first, confirming ones are flagged). */
  next: QueueEntry[];
  nextCallable: QueueEntry | null;
  /** True when the visit has run well past the usual time and staff should be asked. */
  nudge: boolean;
  onBreak: BreakInfo | null;
  /** Counters this customer could be transferred to right now. */
  transferTargets: (CounterOption & { busy: boolean })[];
}

export type QueueScope = "mine" | "all";

export interface QueueState {
  scope: QueueScope;
  now: EpochMs;
  groupIds: ID[];
  counter: number | null;
  /** Waiting customers in call order. */
  waiting: QueueEntry[];
  /** Customers currently called or being served at any counter (for context only). */
  atCounters: QueueEntry[];
  mineCount: number;
  allCount: number;
  longestWaitMin: number | null;
  /** Services this staff member's counter takes, used to disable rows they cannot call. */
  myGroupIds: ID[];
  hasCurrent: boolean;
}

export interface TodayState {
  staff: StaffMember;
  branch: StaffBranch;
  counter: number | null;
  shift: ShiftState;
  now: EpochMs;
  summary: DaySummary;
  /** No-shows the system closed on its own, newest first. Each can be undone. */
  autoClosed: QueueEntry[];
  /** Customers still on the counter, so End shift can say what is left. */
  hasCurrent: boolean;
  /** How many people are still waiting for this counter's services. */
  waitingMine: number;
}

export interface WalkInResult {
  entry: QueueEntry;
  ahead: number;
  estWait: WaitRange;
}

export interface CallOptions {
  /** Call this person instead of the next one in order. */
  entryId?: ID;
  /**
   * How to close the person currently at the counter when they have not arrived yet. Staff must
   * choose: silently closing someone who is still walking over would be unfair to them.
   */
  closeCurrentAs?: "served" | "no_show";
}

export interface StaffService {
  capabilities(): StaffCapabilities;

  /* ------------------------------------------------------------------ session */
  getSession(): Promise<StaffSession | null>;
  signIn(input: StaffLoginInput): Promise<StaffSession>;
  signOut(): Promise<void>;

  /* -------------------------------------------------------------------- shift */
  roster(): Promise<Roster>;
  /** Start the shift at the assigned counter, or at `counter` when staff are elsewhere today. */
  startShift(counter?: number): Promise<CounterState>;
  startBreak(reason: BreakReason): Promise<CounterState>;
  resumeFromBreak(): Promise<CounterState>;
  /** Needs the counter to be clear. Returns the summary for the Start shift screen. */
  endShift(): Promise<Roster>;

  /* ------------------------------------------------------------------ counter */
  counter(): Promise<CounterState>;
  /** Closes the current customer (as served unless told otherwise) and calls the next one. */
  callNext(opts?: CallOptions): Promise<CounterState>;
  /** Closes the current customer when nobody is waiting. */
  finishCurrent(as?: "served" | "no_show"): Promise<CounterState>;
  recall(): Promise<CounterState>;
  transfer(toCounter: number): Promise<CounterState>;
  hold(): Promise<CounterState>;
  /** Bring a held customer back to the counter. The counter must be clear. */
  resume(entryId: ID): Promise<CounterState>;
  setNote(note: string): Promise<CounterState>;
  /** "Still serving": hide the nudge for a while. */
  snoozeNudge(): Promise<CounterState>;

  /* -------------------------------------------------------------------- queue */
  queue(scope: QueueScope): Promise<QueueState>;
  issueWalkIn(input: { name: string; phone: string; serviceId: ID; priority: PriorityTag[] }): Promise<WalkInResult>;
  /** Services staff can issue walk-in tokens for at this branch. */
  walkInServices(): Promise<{ groupId: ID; groupName: string; services: { id: ID; name: string }[] }[]>;

  /* -------------------------------------------------------------------- today */
  today(): Promise<TodayState>;
  /** Call a customer the system closed as a no-show again. The counter must be clear. */
  undoClosure(entryId: ID): Promise<TodayState>;

  /** Fires when anything staff see may have changed (this tab, another tab, or a customer). */
  subscribe(onChange: () => void): () => void;
}

/** Mock only. Lets a demo move without a second person. */
export interface StaffDevApi {
  /** Add simulated customers to the services this staff member's counter takes. */
  addCustomers(count: number): Promise<void>;
  /** The called customer reaches the counter now (instead of after their simulated delay). */
  arriveNow(): Promise<void>;
  /** Clear staff demo data (shifts, simulated customers). Customer data is untouched. */
  resetFloor(): Promise<void>;
}
