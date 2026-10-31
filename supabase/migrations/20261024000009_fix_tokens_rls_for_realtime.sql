-- Migration: 20261024000009_fix_tokens_rls_for_realtime.sql
-- Allow read access on tokens and token_events so Supabase Realtime
-- broadcasts postgres_changes events to both customer clients and staff console tabs.

drop policy if exists "Tokens read policy" on tokens;
create policy "Tokens read policy" on tokens
  for select using (true);

drop policy if exists "Token events read policy" on token_events;
create policy "Token events read policy" on token_events
  for select using (true);
