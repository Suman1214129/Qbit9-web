-- Migration: 20261024000008_enable_supabase_realtime.sql
-- Enable Supabase Realtime broadcast for tokens, token_events, and bookings tables.
-- Without this, postgres_changes WebSocket channels never emit events to clients.

-- Set replica identity to full so update payloads include complete rows
alter table tokens replica identity full;
alter table token_events replica identity full;
alter table bookings replica identity full;

-- Enable Realtime publication for these tables
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Add tables if not already in the publication
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tokens'
    ) then
      alter publication supabase_realtime add table tokens;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'token_events'
    ) then
      alter publication supabase_realtime add table token_events;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
    ) then
      alter publication supabase_realtime add table bookings;
    end if;
  end if;
end;
$$;
