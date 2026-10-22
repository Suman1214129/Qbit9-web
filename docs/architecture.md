# Architecture

```
src/
  app/        routes, thin server pages, route groups (flow) and (app); staff console under app/staff
  features/   screen-level components per area (join, auth, token, home, booking, history, profile, alerts, devtools, pwa, staff)
  components/ ui, brand, layout primitives
  hooks/      TanStack Query queries, mutations, keys, small browser hooks
  providers/  services, queue sync, app providers
  services/   types.ts contracts, registry.ts, mock/ adapter, supabase/ placeholder
  domain/     pure types, policy, queue state machine, wait, slots, validation, geo, history (+ tests)
  lib/        env, clock, storage, format, geolocation, notifications, ics
```

Queue model: a token row stores facts (joinedAt, service, counters, check-in prompt time, lapses, timestamps). `reconcile` computes the stage from facts and `now` and may emit events (nearby, lapsed, called). The same function can run server side later, so client and backend agree.

Live updates: `queue-sync` polls the token view and `AlertsWatcher` diffs views to fire toasts or system notifications. A backend replaces polling with Realtime and push without touching screens.

Testing: Vitest for domain and mock service (including a full journey), Playwright for browser journeys at phone and desktop.

## Staff console

Lives in the same project under `/staff` (see `docs/staff.md`) with the same layering: `domain/staff.ts` -> `services/staff-types.ts` -> `services/mock/staff/` -> `hooks/staff/` -> `features/staff/` -> `app/staff/`. `Services` carries `staff` next to the customer services, so one registry swaps both. `NEXT_PUBLIC_ENABLE_STAFF=false` turns the routes off.

One origin, two apps: in mock mode both read the same browser storage. Customer tokens stay in the customer db; staff-only data (session, shifts, simulated walk-up customers, notes, holds) is under `qbit9.mock.staff.v1`.

One queue: `QueueContext.live` (`domain/queue.ts`) is the backend's knowledge of the real line. When present, `reconcile` never calls anyone, "ahead" and "now serving" come from it, and only the check-in prompt and the real-time windows run. The mock builds it in `services/mock/staff/live.ts` while a staff counter is open at the branch, and otherwise leaves it out so the customer app simulates its own line as before. A real backend always provides it, so the `timing` simulation (`stepMs`, `arriveMs`) is demo-only.

Mock stores write only when data changed. A write fires the change event, which refetches, which reads again, so an unconditional write loops and, with two tabs, lets a stale write overwrite a newer one.

Splitting the staff console into its own app later is a move of `app/staff`, `features/staff` and `hooks/staff`, with `domain/` and `services/` shared as a package.
