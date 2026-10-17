# Architecture

```
src/
  app/        routes, thin server pages, route groups (flow) and (app)
  features/   screen-level components per area (join, auth, token, home, booking, history, profile, alerts, devtools, pwa)
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
