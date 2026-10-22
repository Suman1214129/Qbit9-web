---
name: qbit9
description: Context for building the QBIT9 bank queue and appointment web app, customer side and staff console (Next.js). Use when working on any QBIT9 code, flows, copy or backend handoff.
---
Read `AGENT.md` first, then the relevant file in `docs/`.
Layering: domain (pure) -> services contracts -> mock adapter -> hooks -> features -> app. Never import mock/supabase from features. Rules live in domain with tests.
Queue: stages waiting, checkin (3 away, 3 min), called (5 min), serving, served; lapse sets back 3, two lapses = missed; one 2 min extension.
Policy numbers are sample placeholders in `domain/policy.ts`. Light theme, tokens in globals.css. No em dashes. Verify in a browser at phone and desktop.
Staff console lives under `/staff` (see `docs/staff.md`): same layering (`domain/staff.ts` -> `services/staff-types.ts` -> `services/mock/staff` -> `hooks/staff` -> `features/staff` -> `app/staff`). While a counter is open the customer queue position is the real list staff work (`QueueContext.live`); only staff call people. Mock stores must not write unchanged data.
