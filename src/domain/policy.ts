/**
 * Queue and booking policy.
 *
 * IMPORTANT: every number here is a placeholder for the bank to confirm. The mockups call this out
 * ("The 3 minutes is a placeholder", "policy decisions to settle with the bank"). Keep them in one
 * place so changing a rule is a one line change, and so the backend can load the same values from
 * a `branch_policy` row later.
 */
export interface Policy {
  /** Browser accuracy worse than this (metres) is rejected as unreliable. */
  accuracyLimitM: number;
  /** A location reading older than this is too old to join with. */
  proofTtlMs: number;
  /** "You are 3 away": the check-in prompt starts when this many people are ahead. */
  nearThreshold: number;
  /** How long the customer has to confirm they are still at the branch. */
  checkinWindowMs: number;
  /** Positions the token moves back when check-in is missed or the customer asks to be moved. */
  setback: number;
  /** How many missed check-ins are tolerated before the token is closed as missed. */
  maxLapses: number;
  /** Time to reach the counter after being called. */
  calledWindowMs: number;
  /** Extra time granted by "I need a few more minutes". */
  extraTimeMs: number;
  maxExtensions: number;
  /** Slots can be booked this many days ahead, today included. */
  bookingHorizonDays: number;
  /** Earliest bookable slot is this many minutes from now. */
  bookingLeadMin: number;
  slotMinutes: number;
  /** A booked slot is held this long after its start time. */
  slotHoldMin: number;
  /** Booked customers can check in from this many minutes before their slot. */
  bookingCheckinOpensMin: number;
  /** A booking can be cancelled up to this many minutes before its start. */
  cancelCutoffMin: number;
  /** Reminder is sent this long before a booked slot. */
  reminderMin: number;
  /** Fraction of the line a priority token can jump (it still queues behind other priority). */
  priorityAheadFactor: number;
  /** Booked tokens never queue behind more than this many people. */
  bookedMaxAhead: number;
  /** Customers can hold one active token at a time. */
  maxActiveTokens: number;
}

export const DEFAULT_POLICY: Policy = {
  accuracyLimitM: 150,
  proofTtlMs: 10 * 60_000,
  nearThreshold: 3,
  checkinWindowMs: 3 * 60_000,
  setback: 3,
  maxLapses: 2,
  calledWindowMs: 5 * 60_000,
  extraTimeMs: 2 * 60_000,
  maxExtensions: 1,
  bookingHorizonDays: 7,
  bookingLeadMin: 30,
  slotMinutes: 30,
  slotHoldMin: 15,
  bookingCheckinOpensMin: 30,
  cancelCutoffMin: 30,
  reminderMin: 60,
  priorityAheadFactor: 0.2,
  bookedMaxAhead: 2,
  maxActiveTokens: 1,
};
