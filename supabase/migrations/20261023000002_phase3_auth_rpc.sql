-- Migration: 20261023000002_phase3_auth_rpc.sql
-- Description: RPCs for server time and account deletion with anonymisation.

create or replace function server_now()
returns bigint
language sql
stable
as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

grant execute on function server_now() to anon, authenticated;

-- Atomically deletes personal profile and push subscriptions while anonymising token rows
create or replace function delete_customer_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_signed_in';
  end if;

  -- 1. Anonymise tokens (keep rows for branch analytics, erase personal user_id and notes)
  update tokens
  set user_id = null,
      note = null
  where user_id = v_user_id;

  -- 2. Remove push subscriptions
  delete from push_subscriptions
  where user_id = v_user_id;

  -- 3. Remove bookings
  delete from bookings
  where user_id = v_user_id;

  -- 4. Delete profile
  delete from profiles
  where id = v_user_id;
end;
$$;

grant execute on function delete_customer_account() to authenticated;
