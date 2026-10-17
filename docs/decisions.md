# Decisions and open items

- Light theme only. No i18n yet (Language row omitted).
- Stage is derived, not stored.
- Mock adapter persists to localStorage with deterministic ambient queue so demos are stable.
- SMS gated by `NEXT_PUBLIC_FEATURE_SMS=false`; email is the always-available OTP channel in real mode.
- Open: bank-confirmed policy numbers, real branch data, privacy notice wording (sample text), notification delivery without open tab (needs backend push), iOS alerts need Home Screen install.
