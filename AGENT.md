# QBIT9 web (customer app + staff console)

Smart queue and appointment system for Indian bank branches. This repo holds the **customer** frontend and the **staff** console (under `/staff`). The real backend comes later. Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 tokens, TanStack Query, zod. Mobile first, responsive to desktop.

Read `docs/` before changing behaviour: `product.md`, `customer-flow.md`, `staff.md`, `design-system.md`, `architecture.md`, `backend-handoff.md`, `decisions.md`.

## Layering (enforced by ESLint)
`domain/` pure rules, no IO, no React -> `services/types.ts` contracts -> `services/mock/*` (localStorage adapter, swappable in `services/registry.ts` via `NEXT_PUBLIC_QBIT9_ADAPTER`) -> `hooks/` (TanStack Query) -> `features/*` screens -> `app/` thin server pages.
- Features, components and app never import `@/services/mock` or `@/services/supabase`. Use hooks.
- Business rules (queue stages, wait estimate, slots, validation, policy numbers) live in `domain/` with tests. Never inline them in components.
- Tokens store facts; `reconcile(record, ctx, now)` derives the stage. Do not store derived stage.

## Staff app
Routes `app/staff`, screens `features/staff`, hooks `hooks/staff`, contract `services/staff-types.ts`, mock `services/mock/staff`, rules `domain/staff.ts`. Read `docs/staff.md` first.
- One queue: while a staff counter is open, `QueueContext.live` (see `domain/queue.ts`, built in `services/mock/staff/live.ts`) makes customers' "ahead" the real list staff work through, and only staff call people. With no counter open the customer simulation runs by itself. A backend always behaves like the live mode.
- Mock stores write only when data changed (`mutate`, `mutateFloor`). Unchanged writes fire the change event and cause refetch loops and lost updates across tabs.
- Staff accounts, the demo PIN (`accounts.ts`) and `STAFF_POLICY` are sample values. `NEXT_PUBLIC_ENABLE_STAFF=false` turns the console off.
- Customer alert toasts are not shown on staff screens.

## Commands
`npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e` (Playwright; set `PW_CHROMIUM_PATH` if the bundled browser is missing; build with `NEXT_PUBLIC_ENABLE_DEVTOOLS=true` so the dev panel exists, it is a build-time flag).

## Rules of the house
- No em dashes in copy or docs. Calm, plain, honest copy. No fake data presented as real.
- Policy numbers in `domain/policy.ts` are sample placeholders until the bank confirms. Keep them in one place.
- Alerts in mock mode only work with the tab open. Say so in UI (`env.backgroundAlerts`).
- Design tokens live in `src/app/globals.css`. Reuse `components/ui`, do not hand-roll buttons, sheets, fields.
- After a state-clearing action that navigates, pause route guards (see `useJoinGuard({ paused })`, `lib/leaving.ts`) or they will redirect first.
- Verify UI changes in a real browser at phone (Pixel 7) and 1280x800, customer and staff (`e2e/journey.spec.ts`, `e2e/staff.spec.ts`).
