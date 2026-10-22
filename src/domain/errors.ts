/**
 * Business rule violations. Every one has a stable `code` so the UI can show a specific message
 * and a backend can return the same codes from its RPCs.
 */
export type DomainErrorCode =
  | "not_signed_in"
  | "invalid_phone"
  | "invalid_email"
  | "invalid_code"
  | "code_expired"
  | "too_many_attempts"
  | "branch_not_found"
  | "service_not_found"
  | "branch_closed"
  | "location_required"
  | "location_stale"
  | "location_inaccurate"
  | "too_far"
  | "already_in_queue"
  | "token_not_found"
  | "invalid_state"
  | "checkin_expired"
  | "no_more_time"
  | "slot_unavailable"
  | "slot_in_past"
  | "booking_not_found"
  | "booking_not_cancellable"
  | "booking_window"
  | "invalid_credentials"
  | "account_locked"
  | "shift_not_started"
  | "shift_on_break"
  | "counter_not_found"
  | "counter_taken"
  | "counter_busy"
  | "no_other_counter"
  | "current_not_arrived"
  | "finish_current_first"
  | "queue_empty"
  | "entry_not_found"
  | "entry_not_callable"
  | "recall_limit"
  | "invalid_name"
  | "invalid_note"
  | "network"
  | "unknown";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
