# Supabase adapter (not built yet)

Implement `createSupabaseServices(): Services` here, using the interfaces in `../types.ts` (customer
services) and `../staff-types.ts` (`StaffService`). `Services` carries both, so one adapter serves the
customer app and the staff console. The mapping from each method to a table, RPC or Realtime channel
is in `docs/backend-handoff.md` (see "Staff" for the counter side and "One queue" for how customer
positions must be computed).
