# Customer flow

Entry: QR at branch to `/b/[bank]/[branch]`, or `/branches` search.

1. Landing `/b/[bank]/[branch]`: live waiting count, usual wait, hours. CTA share location and join, or book later.
2. Location `/b/.../location`: one-time GPS proof. Outcomes: ok (within 200 m, accuracy <= 150 m), too far, blocked, inaccurate, unsupported. Proof valid 10 min.
3. Sign in `/sign-in` then `/verify`: 4 digit OTP by phone (when SMS flag or mock) or email. Mock shows a Demo code chip.
4. `/join/service`: pick a service group and service.
5. `/join/review`: priority tags (senior citizen, pensioner, disability) reduce wait; confirm. Join creates the token.
6. `/token/[code]`: welcome (alerts ask), then live view by stage:
   - waiting: people ahead, now serving, estimated wait range, floor plan.
   - checkin: at 3 ahead, confirm presence within 3 min with a fresh location proof, or "move me back".
   - called: 5 min window, counter number, "I am on my way", one 2 min extension.
   - serving, served (`/visit/[code]` stamp, saved time, feedback quick/okay/slow), left, missed.
7. `/home`, `/book`, `/history`, `/profile` (+ alerts, branches, priority, privacy).

Lapse rules: missing check-in or call window pushes you back 3 positions; after 2 lapses the token is missed. Voluntary move back is not a lapse.

Booking: 30 min slots, up to 7 days ahead, 30 min lead, 15 min hold, check-in opens 30 min before, cancel until 30 min before, reminder 60 min before, .ics export. All branches are open Saturdays from 10 am to 10 pm.
