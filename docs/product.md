# Product

QBIT9 lets a customer join a bank branch queue from their own phone after proving once that they are at the branch, then wait anywhere nearby and be alerted when their turn approaches. Customers can also book a visit slot.

Pilot bank branches: SBI and Bank of Baroda (sample branches in Ahmedabad). This repo holds the customer app and the staff console (`docs/staff.md`).

Principles: honest waits (ranges, not false precision), no tracking after the one-time location check, nothing blocks a customer who is slow (grace windows, one extension), privacy minimal (phone or email, first name).

Out of scope here: real SMS or push delivery, payments, real bank data, i18n.
