# Decisions and open items

- Light theme only. No i18n yet (Language row omitted).
- Stage is derived, not stored.
- Mock adapter persists to localStorage with deterministic ambient queue so demos are stable.
- SMS gated by `NEXT_PUBLIC_FEATURE_SMS=false`; email is the always-available OTP channel in real mode.
- Open: bank-confirmed policy numbers, real branch data, privacy notice wording (sample text), notification delivery without open tab (needs backend push), iOS alerts need Home Screen install.
- Staff console lives in the same Next.js project under `/staff` (one origin, shared mock storage). Splitting it out later is a move, not a rewrite. `NEXT_PUBLIC_ENABLE_STAFF` switches it off.
- Staff never choose services. The roster assigns a counter, the counter implies the services.
- Calling next closes the current customer as served. A customer who has not arrived must be closed as a no-show on purpose.
- While a staff counter is open the customer's place is the real queue (`QueueContext.live`), and only staff call people. With none open, the customer simulation runs by itself so the customer app demos alone.
- Open: passkey sign in, sticker or QR scan at the counter, printed slip for walk-ins, bank-confirmed nudge and recall numbers, real rosters, audit log, staff push alerts.
