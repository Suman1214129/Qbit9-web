/**
 * Service contracts.
 *
 * The UI talks to these interfaces and nothing else. `services/mock` implements them over
 * localStorage so the whole product works today; `services/supabase` will implement the same
 * interfaces over Supabase (see docs/backend-handoff.md for the table, RPC and Realtime mapping).
 *
 * Rules every implementation must follow:
 *  - Resolve with plain data from `@/domain`, reject with `DomainError`.
 *  - Be authoritative: re-check location, state and policy on the server side. The client's
 *    checks are for fast feedback only.
 *  - Never trust a client clock for anything that affects fairness (join time, deadlines).
 */
import type {
  Booking, BookingView, Branch, BranchSnapshot, DayAvailability, EpochMs, HistoryItem, HistoryStats, ID,
  LocationProof, OtpChannel, Preferences, PriorityTag, ServiceGroupLive, Session, TokenFeedback, TokenView, User,
} from "@/domain";
import type { StaffDevApi, StaffService } from "./staff-types";

export type Unsubscribe = () => void;

/* ---------------------------------------------------------------- branches */

export interface BranchService {
  list(): Promise<Branch[]>;
  bySlug(bankSlug: string, branchSlug: string): Promise<Branch | null>;
  byId(id: ID): Promise<Branch | null>;
  /** Live numbers for the landing page and branch lists. */
  snapshot(branchId: ID): Promise<BranchSnapshot>;
  snapshots(branchIds: ID[]): Promise<Record<ID, BranchSnapshot>>;
  /** Service catalogue with the current queue length and usual wait next to each service. */
  catalogue(branchId: ID): Promise<ServiceGroupLive[]>;
}

/* -------------------------------------------------------------------- auth */

export interface OtpChallenge {
  channel: OtpChannel;
  /** The normalised identifier the code was sent to (10 digit phone or lowercase email). */
  identifier: string;
  /** Display-safe form, e.g. "+91 98765 43210". */
  sentTo: string;
  expiresAt: EpochMs;
  resendAvailableAt: EpochMs;
  /** True when this identifier has no name on file, so the verify screen should ask for one. */
  needsName: boolean;
  /** Mock adapter only. Real adapters must never return the code. */
  debugCode?: string;
}

export interface VerifyInput {
  channel: OtpChannel;
  identifier: string;
  code: string;
  name?: string | null;
  remember: boolean;
}

export interface ProfilePatch {
  name?: string | null;
  priority?: PriorityTag[];
}

export interface AuthService {
  getSession(): Promise<Session | null>;
  requestOtp(channel: OtpChannel, identifier: string): Promise<OtpChallenge>;
  verifyOtp(input: VerifyInput): Promise<Session>;
  updateProfile(patch: ProfilePatch): Promise<User>;
  signOut(): Promise<void>;
  /** Removes the account and everything attached to it (consent withdrawal). */
  deleteAccount(): Promise<void>;
}

/* ------------------------------------------------------------------- queue */

export interface JoinInput {
  branchId: ID;
  serviceId: ID;
  priority: PriorityTag[];
  /** Location reading taken moments ago. The server re-evaluates it. */
  proof: LocationProof;
}

export interface CheckInBookingInput {
  bookingId: ID;
  proof: LocationProof;
}

export type TokenRef = { id: ID } | { code: string };

export interface QueueService {
  /** The customer's current token, if any (waiting, called or being served). */
  active(): Promise<TokenView | null>;
  get(ref: TokenRef): Promise<TokenView>;
  join(input: JoinInput): Promise<TokenView>;
  checkInBooking(input: CheckInBookingInput): Promise<TokenView>;
  /** "I am still here." Re-checks location, so the proof is required. */
  confirmCheckin(id: ID, proof: LocationProof): Promise<TokenView>;
  moveBack(id: ID): Promise<TokenView>;
  onMyWay(id: ID): Promise<TokenView>;
  requestMoreTime(id: ID): Promise<TokenView>;
  leave(id: ID): Promise<TokenView>;
  sendFeedback(id: ID, feedback: TokenFeedback): Promise<TokenView>;
  /**
   * Called whenever anything about the customer's tokens changes (position, stage, a call).
   * The mock polls its own clock; Supabase will use Realtime. The callback carries no data on
   * purpose: callers invalidate their queries, so the same code path works for both.
   */
  subscribe(onChange: () => void): Unsubscribe;
}

/* ---------------------------------------------------------------- bookings */

export interface CreateBookingInput {
  branchId: ID;
  serviceId: ID;
  startsAt: EpochMs;
}

export interface BookingService {
  availability(branchId: ID, serviceId: ID): Promise<DayAvailability[]>;
  list(): Promise<BookingView[]>;
  get(id: ID): Promise<BookingView>;
  create(input: CreateBookingInput): Promise<BookingView>;
  cancel(id: ID): Promise<BookingView>;
}

/* ----------------------------------------------------------------- history */

export interface HistoryPage {
  items: HistoryItem[];
  stats: HistoryStats;
}

export interface HistoryService {
  list(): Promise<HistoryPage>;
}

/* ------------------------------------------------------------- preferences */

export interface PreferencesService {
  get(): Promise<Preferences>;
  update(patch: Partial<Preferences>): Promise<Preferences>;
  toggleSavedBranch(branchId: ID): Promise<Preferences>;
}

/* ---------------------------------------------------------------- dev tools */

export interface DevSettings {
  /** How fast the mock queue moves: one position per 20 s, per 6 s, or at real service pace. */
  speed: "demo" | "fast" | "realistic";
  /** Replaces the browser location so the whole flow can be tried anywhere. */
  location: "real" | "at_branch" | "too_far" | "blocked" | "inaccurate";
  /** Treat branches as closed to try the closed states. */
  forceClosed: boolean;
}

/** Only the mock adapter provides this. The panel is hidden when it is undefined. */
export interface DevApi {
  settings(): DevSettings;
  update(patch: Partial<DevSettings>): void;
  /** Jump the active token to "3 away" so the check-in prompt shows now. */
  skipToNearby(tokenId: ID): Promise<void>;
  /** Make the active token's turn arrive now (confirms check-in if still pending). */
  callNow(tokenId: ID): Promise<void>;
  /** Counter staff starts serving the called token. */
  staffStartServing(tokenId: ID): Promise<void>;
  /** Counter staff closes the visit. */
  staffFinish(tokenId: ID): Promise<void>;
  /** Let the called window run out. */
  expireCall(tokenId: ID): Promise<void>;
  /** Clear all mock data on this device. */
  reset(): Promise<void>;
  subscribe(fn: () => void): Unsubscribe;
}

export interface Services {
  branches: BranchService;
  auth: AuthService;
  queue: QueueService;
  bookings: BookingService;
  history: HistoryService;
  preferences: PreferencesService;
  dev?: DevApi;
  /** Staff app (counter, queue, walk-ins). See staff-types.ts. */
  staff: StaffService;
  staffDev?: StaffDevApi;
}

export type { Booking };
