# Staff app

Counter staff console for QBIT9, mounted under `/staff` in the same Next.js app as the customer app. One origin, so in mock mode both apps share browser storage and a staff "Call next" reaches a real customer token made in the same browser. A separate staff app later only needs a new project that reuses `domain/` and `services/`.

## Screens

| Route | Screen | Notes |
|---|---|---|
| `/staff/sign-in` | Sign in | Employee ID and 4 to 6 digit PIN. 5 wrong tries lock the account for 5 minutes. The passkey button stays hidden until the backend supports it (`capabilities().passkey`). |
| `/staff/start` | Start shift | The roster decides the counter and the services. One tap to start, or choose another counter if staff sit elsewhere today. Shows the last shift summary once. |
| `/staff/counter` | Counter | One screen, three views: ready (next up, then the list), serving (timer against the usual time, Recall, Transfer, Hold, Note), break (timer, reason, effect on customer waits). A non-dismissible "Still with C-048?" sheet appears when a visit runs long. |
| `/staff/queue` | Queue | My services or whole branch. Tap a row to call that person out of turn, after a confirm. |
| `/staff/walk-in` | Walk-in | Name and phone optional, priority tags, service. Shows the token, people ahead and expected wait. |
| `/staff/today` | Today | Served, no-shows, average time, served per hour, and "Call again" for customers the system closed as no-shows. End shift is here too. |

## Rules worth knowing

- Calling the next person closes the current one as served. If the current customer has not arrived yet, staff must choose: keep waiting or mark no-show. The system never closes a customer who is still walking over without staff choosing.
- Recall is limited to 2 per call and only before the customer arrives. A recall gives a fresh reply window.
- Hold needs the customer at the counter. Resume needs a clear counter.
- Transfer sends the customer to another open counter that takes the same service and has nobody at it.
- A counter on break is left out of customer wait estimates, so waits rise honestly. Customers can still join.
- Order is priority first, then time of joining (or booking slot), then token number. See `compareEntries` in `domain/staff.ts`.
- "Still serving?" shows after `max(5 min, 2 x usual service time)` and snoozes for one usual service time.
- Automatic no-show closures can be reversed from Today while the counter is clear.

## Layering

Same as the customer app, enforced by ESLint.

```
domain/staff.ts            pure rules + tests (order, nudge, transitions, day summary, validation)
services/staff-types.ts    StaffService contract (the only thing screens and hooks know)
services/mock/staff/       localStorage adapter: accounts, floor simulation, service
hooks/staff/               TanStack Query queries, mutations, sync
features/staff/            screens and shell
app/staff/                 thin pages: sign-in, and a (console) group that holds the shell
```

## How the mock links to the customer app

Customer tokens live in the customer mock db. Staff-only data (session, shifts, simulated walk-up customers, notes, holds) lives under its own key, `qbit9.mock.staff.v1`. The staff queue is the union: real customer tokens plus simulated customers who fill out the branch so the demo is not empty. A staff call writes the customer token (`callToken`), so the customer app shows "Your turn" through its normal reconcile path. Staff-called tokens get a 12 hour service time so the customer simulation never finishes a visit that staff are handling.

Both stores only write when something changed. Writing unchanged data fires the change event, which refetches, which reads again, and with two tabs open that loop let a stale customer write overwrite a staff call.

Demo accounts (all PIN `4821`): E48213 Meera (Main Road, counter 4), E48214 Arjun, E48101 Kavita, E48310 Imran, E52007 Neha (Bank of Baroda). The demo tools button (bottom left, mock only) adds simulated customers and makes the called customer arrive.

## One queue

While a staff counter is open at a branch, customers' places come from the same list staff work through (`QueueContext.live`, built in `services/mock/staff/live.ts`; see `docs/architecture.md` and `docs/backend-handoff.md`):

- A customer's "people ahead" and "now serving" are real. Calling someone from the Queue or Counter screens moves everyone behind them.
- Nobody is called by a timer. Only staff call people. A customer waits in the line until staff reach them.
- The check-in prompt opens when the customer is within 3 of the front. While it is open, staff cannot call them (the row shows "confirming").
- Service lists and the join review show the real count for the service's queue.

With nobody on a counter, the customer app simulates its own line as before, so it still demos alone. If every counter closes mid-demo, customers go back to the simulation. The customer dev panel's "Skip to 3 away" and "Call me now" act on the real queue in this mode (open the prompt, or act as a counter calling you).

## Known mock limits

- No background alerts: a call or recall reaches the customer only while their tab is open. Real push needs the backend.
- Simulated customers fill the branch so a demo is not empty. They reply and arrive on a script. Real customers do this themselves.
- Passkey sign in and sticker or QR scan at the counter are not built.
- Earlier hours on Today are demo data, labelled as such. Staff accounts, the PIN and every number in `STAFF_POLICY` are sample values to confirm with the bank.
- Staff screen guards are client side. The backend must enforce session, branch and shift on every call.
