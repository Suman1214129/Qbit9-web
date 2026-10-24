-- Migration: 20261023000006_phase7_timers_cron.sql
-- Queue timer functions for expiring check-ins, called windows, and no-shows

create or replace function advance_queue_timers()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_expired_checkins integer := 0;
  v_expired_called integer := 0;
  v_expired_bookings integer := 0;
  v_token record;
  v_policy record;
  v_setback integer;
  v_max_lapses integer;
begin
  -- 1. Advance lapsed check-ins
  for v_token in
    select t.*
    from tokens t
    left join policy_config pc on pc.branch_id = t.branch_id
    where t.called_at is null
      and t.served_at is null
      and t.missed_at is null
      and t.left_at is null
      and t.checkin_prompted_at is not null
      and t.checkin_confirmed_at is null
      and v_now > (t.checkin_prompted_at + (coalesce(pc.checkin_window_ms, 180000) || ' milliseconds')::interval)
    for update skip locked
  loop
    select coalesce(setback, 3), coalesce(max_lapses, 2)
    into v_setback, v_max_lapses
    from policy_config where branch_id = v_token.branch_id;

    if (v_token.lapse_count + 1) > v_max_lapses then
      update tokens
      set missed_at = v_now,
          lapse_count = lapse_count + 1,
          closed_by = 'auto'
      where id = v_token.id;

      insert into token_events (token_id, type, actor)
      values (v_token.id, 'missed', 'system');
    else
      update tokens
      set delay_positions = delay_positions + v_setback,
          lapse_count = lapse_count + 1,
          checkin_prompted_at = null
      where id = v_token.id;

      insert into token_events (token_id, type, actor, meta)
      values (v_token.id, 'checkin_lapsed', 'system', jsonb_build_object('lapse_count', v_token.lapse_count + 1, 'setback', v_setback));
    end if;

    v_expired_checkins := v_expired_checkins + 1;
  end loop;

  -- 2. Advance expired called tokens (no-shows)
  for v_token in
    select t.*
    from tokens t
    left join policy_config pc on pc.branch_id = t.branch_id
    where t.called_at is not null
      and t.serving_started_at is null
      and t.served_at is null
      and t.missed_at is null
      and t.left_at is null
      and v_now > (t.called_at + ((coalesce(pc.called_window_ms, 300000) + t.extra_time_ms) || ' milliseconds')::interval)
    for update skip locked
  loop
    update tokens
    set missed_at = v_now,
        closed_by = 'auto'
    where id = v_token.id;

    insert into token_events (token_id, type, actor)
    values (v_token.id, 'no_show', 'system');

    v_expired_called := v_expired_called + 1;
  end loop;

  -- 3. Settle expired bookings past hold time
  update bookings
  set status = 'missed'
  where status = 'upcoming'
    and v_now > (starts_at + interval '15 minutes');

  get diagnostics v_expired_bookings = row_count;

  return jsonb_build_object(
    'expired_checkins', v_expired_checkins,
    'expired_called', v_expired_called,
    'expired_bookings', v_expired_bookings,
    'ran_at', v_now
  );
end;
$$;
