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
