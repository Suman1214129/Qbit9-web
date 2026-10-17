# QBIT9 customer web app

Smart queue and appointment system for Indian bank branches. This repo is the **customer** frontend only (staff app and real backend come later). Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 tokens, TanStack Query, zod. Mobile first, responsive to desktop.

Read `docs/` before changing behaviour: `product.md`, `customer-flow.md`, `design-system.md`, `architecture.md`, `backend-handoff.md`, `decisions.md`.

## Layering (enforced by ESLint)
`domain/` pure rules, no IO, no React -> `services/types.ts` contracts -> `services/mock/*` (localStorage adapter, swappable in `services/registry.ts` via `NEXT_PUBLIC_QBIT9_ADAPTER`) -> `hooks/` (TanStack Query) -> `features/*` screens -> `app/` thin server pages.
- Features, components and app never import `@/services/mock` or `@/services/supabase`. Use hooks.
- Business rules (queue stages, wait estimate, slots, validation, policy numbers) live in `domain/` with tests. Never inline them in components.
- Tokens store facts; `reconcile(record, ctx, now)` derives the stage. Do not store derived stage.

## Commands
`npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e` (Playwright; set `PW_CHROMIUM_PATH` if the bundled browser is missing; build with `NEXT_PUBLIC_ENABLE_DEVTOOLS=true` so the dev panel exists, it is a build-time flag).

## Rules of the house
- No em dashes in copy or docs. Calm, plain, honest copy. No fake data presented as real.
- Policy numbers in `domain/policy.ts` are sample placeholders until the bank confirms. Keep them in one place.
- Alerts in mock mode only work with the tab open. Say so in UI (`env.backgroundAlerts`).
- Design tokens live in `src/app/globals.css`. Reuse `components/ui`, do not hand-roll buttons, sheets, fields.
- After a state-clearing action that navigates, pause route guards (see `useJoinGuard({ paused })`, `lib/leaving.ts`) or they will redirect first.
- Verify UI changes in a real browser at phone (Pixel 7) and 1280x800.
