# What changed from your Qbit9-web-main zip

This is your repo with the staff console merged in, plus fixes. Replace your project folder with this one (keep your `.git` and `node_modules`), then:

```bash
npm install            # lockfile is unchanged, nothing new to install
npm run check          # typecheck + lint + 207 unit tests
NEXT_PUBLIC_ENABLE_DEVTOOLS=true npm run build
npm run e2e            # 12 browser tests, customer + staff, phone + desktop
```

Customer: `/`. Staff: `/staff` (demo login `E48213` / `4821`, sample data).
`changes.patch` is the full diff against your zip if you want to review it in git.

## Added (staff console)
`src/app/staff`, `src/features/staff`, `src/hooks/staff`, `src/domain/staff.ts` (+ tests), `src/services/staff-types.ts`, `src/services/mock/staff/` (+ tests), `e2e/staff.spec.ts`, `docs/staff.md`.

## Connection between customer and staff (new)
While a staff counter is open, customers' places in the queue are the real list staff work through. Before, the customer app ran its own timer, so staff calls never moved anyone.
- `domain/queue.ts`: new optional `QueueContext.live` (`ahead`, `nowServing`). When present, nobody is called by a timer, "ahead" is real, and only the check-in prompt and the real-time windows run. Without it, behaviour is exactly as before.
- `services/mock/staff/live.ts` builds it from the two mock stores (and is the model for the backend query). Service lists and the join review show the real queue count too.
- Staff cannot call a customer whose check-in prompt is open ("confirming").
- Customer dev panel "Skip to 3 away" / "Call me now" still work in this mode.
- With no counter open the customer app simulates its own line like before, so it still demos alone.

## Bugs fixed
- Mock store rewrote itself on every read in a loop; with two tabs a stale customer write could erase a staff call. `mutate` (customer db) and `mutateFloor` now write only when data changed.
- Primary buttons showed dark text because a global `button { color: inherit }` was unlayered and beat Tailwind. Now inside `@layer base`.
- Customer alert toasts no longer pop up on staff screens; the customer dev panel hides on `/staff`.
- Staff-store reads no longer fire change events (found as a stack overflow after "Start shift" in the browser).

## Cleaned up for the backend phase
- Mock-only `sim` field moved out of the domain `EntryRecord` into the mock (`MockEntryRecord`).
- Removed dead code: `weekdayName`, `isTokenCode`, `tokenIdFor`, `prioritySchema`, `getPendingSignIn`, `getDraft`, `formatRupees`, `ALL_SERVICES`, `isRowActive`, `isWaiting`, `breakReasonOf`, `WalkInInput`, plus unused imports.
- No circular imports (checked with madge).
- New flag `NEXT_PUBLIC_ENABLE_STAFF` (default true). `false` makes `/staff` return 404 for a customer-only deployment. Build-time, like every `NEXT_PUBLIC_*`. Staff pages are `noindex`.
- `Services` now has `staff` next to the customer services; one adapter serves both.
- Docs updated: `architecture.md`, `backend-handoff.md` (new "One queue" and "Staff" sections), `decisions.md`, `product.md`, `staff.md`, `README.md`, `AGENT.md`, `.agent/skills/qbit9/SKILL.md`, `services/supabase/README.md`.

## Left alone on purpose
- `@testing-library/react` and `@testing-library/user-event` are unused devDependencies. I did not remove them because that edits `package-lock.json`. Remove with `npm uninstall` if you want.
- `public/sw.js` looks unused to static tools but is registered by string at runtime. Kept.
- Code style: your repo is not Prettier-clean at width 100 and I did not reformat it, to keep the diff reviewable.

## Still sample data or not built
Staff accounts, demo PIN, every number in `STAFF_POLICY` and `domain/policy.ts`, simulated customers, earlier hours on Today. Not built: passkey sign in, sticker/QR scan, printed walk-in slip, background push, audit log, real rosters.
