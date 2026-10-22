# Backend handoff

Implement each interface in `src/services/types.ts` in a new adapter (`services/supabase/`), register it in `services/registry.ts`. Screens do not change.

| Service | Responsibility | Suggested backend |
|---|---|---|
| AuthService | OTP request/verify, session, sign out, delete account | Supabase Auth (phone/email OTP); SMS provider behind `NEXT_PUBLIC_FEATURE_SMS` |
| BranchService | branches, catalogue, live waiting counts | tables `banks`, `branches`, `service_groups`, `services`; counts via view |
| QueueService | join, getToken, confirmCheckin(proof), moveBack, onMyWay, moreTime, leave | RPCs that run `reconcile` server side; Realtime on `tokens` |
| BookingService | slots, create, cancel, list | `bookings` table, unique (branch, slot, service capacity), RPC for hold |
| HistoryService | visits and stats | view over `tokens` and `bookings` |
| PreferencesService | alerts, priority, consent | `profiles` row |
| StaffService | staff sign in, shift and counter state, call/recall/transfer/hold, queue, walk-ins, today (`services/staff-types.ts`) | tables `staff`, `rosters`, `counters`, `shifts`, `breaks`, `queue_entries`; RPCs under "Staff"; Realtime on `tokens` and `queue_entries` |

Rules to enforce server side (do not trust client): location proof (distance, accuracy, TTL), join eligibility, priority position, lapse and setback, booking capacity, closed dates, OTP rate limits and attempts. Policy values in `domain/policy.ts` should become per-branch config.

Push: store Web Push subscriptions per user; send on `nearby` and `called` events. `public/sw.js` already handles push and notificationclick. Then set `env.backgroundAlerts` true.

Errors: throw `DomainError` codes from `domain/errors.ts`; UI maps codes to copy.

## One queue

The customer's place and the staff list must be the same data. In the mock this is `QueueContext.live` (`services/mock/staff/live.ts`). The backend equivalent:

- One queue per branch, per service group, per day. Order is `compareQueueOrder` in `domain/staff.ts`: priority first, then join time (booking slot for booked visits, join time plus setback for tokens moved back), then token number.
- `ahead` for a token is the number of waiting tokens before it in that order, computed server side. `nowServing` is the most recently called token of the group. Return both in `TokenView`; do not derive them from a timer.
- Only staff actions (`call_next`, `call_entry`) set `called_at`. Nothing calls a token by itself. The check-in prompt opens once `ahead <= nearThreshold` and closes after `checkinWindowMs`; a missed check-in sets the token back `setback` places. Staff cannot call a token whose prompt is open.
- The called window (`calledWindowMs`, plus extensions) and the no-show closure run on a server timer or in `reconcile`.
- Wait estimates and "people ahead" before joining use the same real counts. A counter on break leaves the capacity used for the estimate.
- Realtime on `tokens` and `queue_entries` replaces polling for both apps. Push on `nearby`, `called` and `recalled` reaches customers with the app closed.
- The `timing` simulation in `domain/queue.ts` (`stepMs`, `arriveMs`, `serviceMs`) and `startServing`/`finishServing` timers exist for the mock. Drop them when the backend lands.

## Staff

Implement `StaffService` in `services/staff-types.ts`. Every method is authoritative on the server: check the staff session, branch and shift, never trust the screen. Screen guards in the console are for experience only.

- Sign in: employee ID + PIN. Hash PINs (argon2id or bcrypt), never store or log them. Lock after 5 wrong tries for 5 minutes server side, and give the same error for an unknown ID and a wrong PIN. Passkeys (WebAuthn) come later: `capabilities().passkey` hides the button until then. Sessions last one shift (8 h). Staff auth is separate from customer auth (different table, different session).
- Rosters: the branch admin assigns staff to a counter and hours per day. `startShift` at another counter is allowed only if nobody else has it open. Counters map to service groups, so staff never pick services.
- RPCs (transactional, each returns the fresh counter state): `call_next(entry_id?, close_current_as?)`, `finish_current(as)`, `recall` (max 2, only before arrival, fresh reply window), `transfer(to_counter)`, `hold`, `resume(entry_id)`, `set_note` (140 chars), `snooze_nudge`, `issue_walk_in(name, phone, service_id, priority[])`, `undo_closure(entry_id)`, `start_break(reason)`, `resume_from_break`, `end_shift` (needs a clear counter).
- Rules to enforce: never close an arrived-but-unserved customer silently (staff choose served or no-show); call next closes the current visit; automatic no-show closures are reversible while the counter is clear; a held customer needs a clear counter to resume; staff only act on their branch.
- `callToken`, `recallToken`, `markTokenNoShow`, `reopenToken`, `transferToken` in `domain/staff.ts` are the pure transitions on customer tokens. Reuse them server side next to `reconcile`.
- Walk-ins without a phone are counter entries (`EntryRecord`). With a phone they can become a normal token the customer can follow.
- `STAFF_POLICY` (nudge, recall limit, PIN rules, lockout, session) is sample data. Make it per-branch config.
- Audit: record who called, recalled, transferred, closed or undid what and when. Banks will ask.
- Staff push: a staff browser tab can use Realtime; alerts for "customer replied" need no push.
