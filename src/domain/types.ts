/**
 * QBIT9 domain types.
 *
 * These are the shapes the whole app speaks. They are deliberately plain data (no classes,
 * no framework types) so a backend row, an API response and a mock record all look the same.
 * Anything time-related is an epoch in milliseconds (UTC). Branch-local presentation (opening
 * hours, "11:30 am") goes through the branch timezone helpers in `./time`.
 */

export type ID = string;
export type EpochMs = number;

/* ---------------------------------------------------------------- geography */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** What the browser told us, captured at a moment. Sent with join and check-in requests. */
export interface LocationProof {
  lat: number;
  lng: number;
  /** Horizontal accuracy radius in metres, as reported by the browser. */
  accuracyM: number;
  capturedAt: EpochMs;
}

/* ------------------------------------------------------------------ catalogue */

export interface Bank {
  id: ID;
  /** URL slug, e.g. "sbi". Used in /b/[bank]/[branch]. */
  slug: string;
  name: string;
  /** Short mark shown in the avatar circle, e.g. "SBI". */
  shortName: string;
}

/** One weekday's hours in branch-local "HH:mm". null means closed. Index 0 is Sunday. */
export type DayHours = { open: string; close: string } | null;

export interface Counter {
  number: number;
  /** Service groups this counter serves. */
  groupIds: ID[];
}

export interface Branch {
  id: ID;
  bankId: ID;
  bank: Bank;
  /** URL slug, unique within the bank. */
  slug: string;
  name: string;
  address: string;
  area: string;
  city: string;
  location: GeoPoint;
  /** Customers must be within this many metres to take a walk-in token. */
  joinRadiusM: number;
  /** IANA timezone used for opening hours and slot labels. */
  timezone: string;
  /** Seven entries, Sunday first. */
  hours: DayHours[];
  /** Branch-local dates (YYYY-MM-DD) the branch is shut despite normal hours. */
  closedDates: string[];
  counters: Counter[];
}

export interface Service {
  id: ID;
  groupId: ID;
  name: string;
  /** Typical time one customer spends at a counter, in minutes. */
  avgServiceMin: number;
  /** What the customer should bring. Shown after joining and when booking. */
  bring: string[];
  /** Whether this service can be booked in advance. */
  bookable: boolean;
}

export interface ServiceGroup {
  id: ID;
  name: string;
  /** Letter used in token codes, e.g. "C" gives C-047. */
  tokenPrefix: string;
  services: Service[];
}

/** A min to max estimate in whole minutes. {0, 0} means "no wait". */
export interface WaitRange {
  minMin: number;
  maxMin: number;
}

export interface ServiceLive extends Service {
  waiting: number;
  usualWait: WaitRange;
}

export interface ServiceGroupLive extends Omit<ServiceGroup, "services"> {
  services: ServiceLive[];
}

/** What the branch landing page and branch lists show about a branch right now. */
export interface BranchSnapshot {
  branchId: ID;
  waitingTotal: number;
  /** Typical wait across the busiest services, in minutes. */
  usualWaitMin: number;
  isOpen: boolean;
  /** Branch-local closing time as "4 pm", or null when closed today. */
  closesLabel: string | null;
  /** Human text for when it next opens, when closed. */
  opensLabel: string | null;
  updatedAt: EpochMs;
}

/* ------------------------------------------------------------------- people */

export const PRIORITY_TAGS = ["senior_citizen", "pensioner", "disability"] as const;
export type PriorityTag = (typeof PRIORITY_TAGS)[number];

export interface User {
  id: ID;
  name: string | null;
  /** Ten digit Indian mobile number without country code, or null for email sign in. */
  phone: string | null;
  email: string | null;
  /** Default priority tags, which the customer can change per visit. */
  priority: PriorityTag[];
  createdAt: EpochMs;
}

export interface Session {
  user: User;
  expiresAt: EpochMs;
  /** True when the customer asked to stay signed in on this device. */
  remember: boolean;
}

export type OtpChannel = "phone" | "email";

export interface Preferences {
  browserAlerts: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  whatsappAlerts: boolean;
  savedBranchIds: ID[];
  lastBranchId: ID | null;
}

/* ------------------------------------------------------------------- tokens */

export type TokenSource = "walk_in" | "booking";
export type TokenFeedback = "quick" | "okay" | "slow";

/**
 * The stored truth about one token. A backend `tokens` row would hold these same columns.
 * Everything the screens show (position, wait, stage) is derived from this plus the clock,
 * see `./queue`.
 */
export interface TokenRecord {
  id: ID;
  /** Display code, e.g. "C-047". */
  code: string;
  /** Sequence number within the group and day, e.g. 47. */
  number: number;
  branchId: ID;
  serviceId: ID;
  groupId: ID;
  userId: ID;
  source: TokenSource;
  priority: PriorityTag[];
  joinedAt: EpochMs;
  /** People ahead of this customer when the token was issued. */
  aheadAtJoin: number;
  /** Positions this token was pushed back after missed check-ins. */
  delayPositions: number;
  lapseCount: number;
  /** When the current (or next) "are you still here?" prompt starts. null until first computed. */
  checkinPromptedAt: EpochMs | null;
  /** Set when the customer confirmed they are still at the branch for the current prompt. */
  checkinConfirmedAt: EpochMs | null;
  calledAt: EpochMs | null;
  counter: number | null;
  onMyWayAt: EpochMs | null;
  /** Extra milliseconds granted by "I need a few more minutes". */
  extraTimeMs: number;
  extensionCount: number;
  servingStartedAt: EpochMs | null;
  servedAt: EpochMs | null;
  missedAt: EpochMs | null;
  leftAt: EpochMs | null;
  feedback: TokenFeedback | null;
  /** Last time `reconcileToken` ran, so each milestone is reported once. */
  reconciledAt: EpochMs;
  bookingId: ID | null;
}

/** What the customer is looking at right now. */
export type TokenStage =
  | "waiting"
  | "checkin" // 3 away, confirm you are still here
  | "called"
  | "serving"
  | "served"
  | "missed"
  | "left";

export interface TokenView {
  id: ID;
  code: string;
  number: number;
  branchId: ID;
  branchName: string;
  branchSlug: string;
  bankName: string;
  bankSlug: string;
  serviceId: ID;
  serviceName: string;
  groupId: ID;
  source: TokenSource;
  priority: PriorityTag[];
  stage: TokenStage;
  /** How many times this token has been pushed back (missed check-in or "move me back"). */
  movedBack: number;
  /** People ahead including whoever is at the counter. 0 once called. */
  ahead: number;
  /** ahead + 1, for "8th in line". */
  position: number;
  nowServingCode: string | null;
  estWait: WaitRange;
  usualWait: WaitRange;
  /** Counter this customer is likely to be called to, or the real one once called. */
  counter: number | null;
  counterIsAssigned: boolean;
  joinedAt: EpochMs;
  calledAt: EpochMs | null;
  /** Deadline to reach the counter once called. */
  callDeadline: EpochMs | null;
  /** Deadline to confirm presence while in the "checkin" stage. */
  checkinDeadline: EpochMs | null;
  canRequestMoreTime: boolean;
  onMyWay: boolean;
  servedAt: EpochMs | null;
  waitedMs: number | null;
  /** Time spent before the 3-away prompt, i.e. time you did not need to stand in line. */
  savedMs: number | null;
  feedback: TokenFeedback | null;
  bring: string[];
  /** When this view was computed. */
  updatedAt: EpochMs;
}

/** Things that happened to a token between two reconciliations. Used to fire alerts once. */
export type TokenEvent =
  | { type: "nearby"; at: EpochMs }
  | { type: "checkin_lapsed"; at: EpochMs }
  | { type: "called"; at: EpochMs; counter: number | null }
  | { type: "serving"; at: EpochMs }
  | { type: "served"; at: EpochMs }
  | { type: "missed"; at: EpochMs };

/* ----------------------------------------------------------------- bookings */

export type BookingStatus = "upcoming" | "checked_in" | "completed" | "cancelled" | "missed";

export interface Booking {
  id: ID;
  userId: ID;
  branchId: ID;
  serviceId: ID;
  startsAt: EpochMs;
  durationMin: number;
  status: BookingStatus;
  createdAt: EpochMs;
  tokenId: ID | null;
}

export interface BookingView extends Booking {
  branchName: string;
  serviceName: string;
  bring: string[];
  /** True inside the window where the customer can check in for this booking. */
  canCheckIn: boolean;
  canCancel: boolean;
}

export type SlotStatus = "free" | "full" | "past";

export interface Slot {
  startsAt: EpochMs;
  /** Branch-local label, e.g. "11:30". */
  label: string;
  part: "morning" | "afternoon";
  status: SlotStatus;
}

export interface DayAvailability {
  /** Branch-local date as YYYY-MM-DD. */
  date: string;
  weekday: string;
  dayOfMonth: number;
  open: boolean;
  slots: Slot[];
}

/* ------------------------------------------------------------------ history */

export type HistoryStatus = "served" | "left" | "missed" | "active" | "upcoming" | "cancelled";

export interface HistoryItem {
  id: ID;
  kind: "token" | "booking";
  refId: ID;
  title: string;
  branchName: string;
  code: string | null;
  at: EpochMs;
  status: HistoryStatus;
  waitedMin: number | null;
  savedMin: number | null;
}

export interface HistoryStats {
  visits: number;
  averageWaitMin: number | null;
  savedMin: number;
}
