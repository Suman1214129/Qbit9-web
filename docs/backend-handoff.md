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

Rules to enforce server side (do not trust client): location proof (distance, accuracy, TTL), join eligibility, priority position, lapse and setback, booking capacity, closed dates, OTP rate limits and attempts. Policy values in `domain/policy.ts` should become per-branch config.

Push: store Web Push subscriptions per user; send on `nearby` and `called` events. `public/sw.js` already handles push and notificationclick. Then set `env.backgroundAlerts` true.

Errors: throw `DomainError` codes from `domain/errors.ts`; UI maps codes to copy.
