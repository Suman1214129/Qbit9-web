# QBIT9 web

Customer app and staff console for the QBIT9 bank queue and appointment system.

```
npm install
cp .env.example .env.local
npm run dev        # customer: http://localhost:3000   staff: http://localhost:3000/staff
npm run check      # typecheck + lint + unit tests
npm run e2e        # Playwright (build with NEXT_PUBLIC_ENABLE_DEVTOOLS=true)
```

Runs fully on a mock backend (localStorage). The customer dev panel (bottom-left) can skip to 3 away, call you, start and finish service, and override location. The staff console has its own demo tools.

Staff demo login: employee ID `E48213`, PIN `4821` (sample data). While a staff counter is open, customers' places in the queue come from the same list staff work through, so calling someone from `/staff` moves the customer app too (use two tabs).

Docs are in `docs/` (start with `product.md`, `architecture.md`, `staff.md`, `backend-handoff.md`). AI context is in `AGENT.md` and `.agent/skills/qbit9`.
