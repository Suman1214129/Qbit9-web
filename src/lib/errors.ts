import { isDomainError, type DomainErrorCode } from "@/domain";

const COPY: Record<DomainErrorCode, string> = {
  not_signed_in: "Please sign in to continue.",
  invalid_phone: "Enter a valid 10 digit mobile number.",
  invalid_email: "Enter a valid email address.",
  invalid_code: "That code does not match. Check it and try again.",
  code_expired: "That code has expired. Ask for a new one.",
  too_many_attempts: "Too many tries. Wait a minute and ask for a new code.",
  branch_not_found: "We could not find that branch.",
  service_not_found: "That service is not available at this branch.",
  branch_closed: "This branch is closed right now. You can book a visit for later.",
  location_required: "We need your location once to confirm you are at the branch.",
  location_stale: "Your location reading is out of date. Check it again.",
  location_inaccurate: "Your location is not precise enough. Step outside or turn on precise location, then try again.",
  too_far: "You are too far from the branch to join the queue.",
  already_in_queue: "You already have an active token.",
  token_not_found: "We could not find that token.",
  invalid_state: "That is not possible for this token right now.",
  checkin_expired: "The check-in window has passed.",
  no_more_time: "Extra time has already been used for this visit.",
  slot_unavailable: "That slot was just taken. Pick another time.",
  slot_in_past: "That time has passed. Pick a later slot.",
  booking_not_found: "We could not find that booking.",
  booking_not_cancellable: "It is too close to the visit time to cancel online.",
  booking_window: "Check-in opens 30 minutes before your slot.",
  invalid_credentials: "Employee ID or PIN does not match.",
  account_locked: "Too many wrong PINs. Wait a few minutes, or ask your branch admin to reset it.",
  shift_not_started: "Start your shift first.",
  shift_on_break: "Resume your counter first.",
  counter_not_found: "That counter does not exist at this branch.",
  counter_taken: "Someone else has that counter open.",
  counter_busy: "That counter is serving someone right now.",
  no_other_counter: "No other counter serves this service right now.",
  current_not_arrived: "The current customer has not reached the counter yet.",
  finish_current_first: "Finish with the current customer first.",
  queue_empty: "Nobody is waiting for your services.",
  entry_not_found: "That customer is no longer in the queue.",
  entry_not_callable: "That customer cannot be called right now.",
  recall_limit: "Already recalled twice. Mark them as a no-show or wait for the window to close.",
  invalid_name: "Use letters only for the name.",
  invalid_note: "That note is too long.",
  network: "You look offline. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

export function errorCode(e: unknown): DomainErrorCode {
  return isDomainError(e) ? e.code : "unknown";
}

export function errorMessage(e: unknown): string {
  if (isDomainError(e)) {
    // Server supplied text wins over the generic copy when it is more specific.
    return COPY[e.code] ?? e.message;
  }
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return COPY.network;
  return COPY.unknown;
}
