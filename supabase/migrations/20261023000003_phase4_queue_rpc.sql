-- Migration: 20261023000003_phase4_queue_rpc.sql
-- Queue core RPCs and updated token_view

-- 1. Haversine distance calculator in metres (matches domain/geo.ts)
create or replace function calculate_distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
) returns double precision
language plpgsql immutable
as $$
declare
  r double precision := 6371008.8;
  dlat double precision;
  dlng double precision;
  h double precision;
begin
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  h := sin(dlat / 2.0)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2.0)^2;
  return 2.0 * r * asin(least(1.0, sqrt(h)));
end;
$$;

-- 2. Enhanced token_view including avg_service_min, counters, and ahead_at_join
create or replace view token_view as
with ranked_tokens as (
  select
    t.id,
    t.branch_id,
    t.group_id,
    t.day,
    t.joined_at,
    (cardinality(t.priority) > 0) as has_priority,
    (t.joined_at + ((t.delay_positions * 3) || ' minutes')::interval) as effective_order_at,
    t.number,
    t.called_at,
    t.served_at,
    t.missed_at,
    t.left_at
  from tokens t
  where t.called_at is null
    and t.served_at is null
    and t.missed_at is null
    and t.left_at is null
),
now_serving_tokens as (
  select distinct on (branch_id, group_id, day)
    branch_id,
    group_id,
    day,
    code as now_serving_code
  from tokens
  where called_at is not null
  order by branch_id, group_id, day, called_at desc
),
group_counters as (
  select
    c.branch_id,
    cg.group_id,
    count(distinct c.id)::integer as counter_count
  from counters c
  join counter_groups cg on cg.counter_id = c.id
  group by c.branch_id, cg.group_id
)
select
  t.id,
  t.code,
  t.number,
  t.branch_id,
  b.name as branch_name,
  b.slug as branch_slug,
  bk.name as bank_name,
  bk.slug as bank_slug,
  t.service_id,
  s.name as service_name,
  t.group_id,
  t.source,
  t.priority,
  case
    when t.left_at is not null then 'left'
    when t.served_at is not null then 'served'
    when t.missed_at is not null then 'missed'
    when t.serving_started_at is not null then 'serving'
    when t.called_at is not null then 'called'
    when t.checkin_prompted_at is not null and t.checkin_confirmed_at is null
         and (t.checkin_prompted_at + ((coalesce(pc.checkin_window_ms, 180000)) || ' milliseconds')::interval) > now()
      then 'checkin'
    else 'waiting'
  end as stage,
  t.delay_positions as moved_back,
  case
    when t.called_at is not null or t.served_at is not null or t.missed_at is not null or t.left_at is not null then 0
    else (
      select count(*)::integer
      from ranked_tokens r
      where r.branch_id = t.branch_id
        and r.group_id = t.group_id
        and r.day = t.day
        and r.id <> t.id
        and (
          (r.has_priority and not (cardinality(t.priority) > 0))
          or ((r.has_priority = (cardinality(t.priority) > 0)) and r.effective_order_at < (t.joined_at + ((t.delay_positions * 3) || ' minutes')::interval))
          or ((r.has_priority = (cardinality(t.priority) > 0)) and r.effective_order_at = (t.joined_at + ((t.delay_positions * 3) || ' minutes')::interval) and r.number < t.number)
        )
    )
  end as ahead,
  case
    when t.called_at is not null or t.served_at is not null or t.missed_at is not null or t.left_at is not null then 1
    else (
      select count(*)::integer + 1
      from ranked_tokens r
      where r.branch_id = t.branch_id
        and r.group_id = t.group_id
        and r.day = t.day
        and r.id <> t.id
        and (
          (r.has_priority and not (cardinality(t.priority) > 0))
          or ((r.has_priority = (cardinality(t.priority) > 0)) and r.effective_order_at < (t.joined_at + ((t.delay_positions * 3) || ' minutes')::interval))
          or ((r.has_priority = (cardinality(t.priority) > 0)) and r.effective_order_at = (t.joined_at + ((t.delay_positions * 3) || ' minutes')::interval) and r.number < t.number)
        )
    )
  end as position,
  nst.now_serving_code,
  case when t.counter is not null then t.counter else null end as counter,
  (t.called_at is not null) as counter_is_assigned,
  extract(epoch from t.joined_at) * 1000 as joined_at,
  case when t.called_at is not null then extract(epoch from t.called_at) * 1000 else null end as called_at,
  case
    when t.called_at is not null then
      extract(epoch from (t.called_at + ((coalesce(pc.called_window_ms, 300000) + t.extra_time_ms) || ' milliseconds')::interval)) * 1000
    else null
  end as call_deadline,
  case
    when t.checkin_prompted_at is not null then
      extract(epoch from (t.checkin_prompted_at + (coalesce(pc.checkin_window_ms, 180000) || ' milliseconds')::interval)) * 1000
    else null
  end as checkin_deadline,
  (t.extension_count < coalesce(pc.max_extensions, 1)) as can_request_more_time,
  (t.on_my_way_at is not null) as on_my_way,
  case when t.served_at is not null then extract(epoch from t.served_at) * 1000 else null end as served_at,
  case
    when t.served_at is not null then extract(epoch from (t.served_at - t.joined_at)) * 1000
    else null
  end as waited_ms,
  null::numeric as saved_ms,
  t.feedback,
  s.bring,
  s.avg_service_min,
  coalesce(gc.counter_count, 1) as counters,
  t.ahead_at_join,
  now() as updated_at,
  t.user_id
from tokens t
join branches b on b.id = t.branch_id
join banks bk on bk.id = b.bank_id
join services s on s.id = t.service_id
left join policy_config pc on pc.branch_id = t.branch_id
left join group_counters gc on gc.branch_id = t.branch_id and gc.group_id = t.group_id
left join now_serving_tokens nst on nst.branch_id = t.branch_id and nst.group_id = t.group_id and nst.day = t.day;

-- 3. Atomic join_queue RPC
create or replace function join_queue(
  p_branch_id text,
  p_service_id text,
  p_priority text[],
  p_proof_lat double precision,
  p_proof_lng double precision,
  p_proof_accuracy double precision,
  p_proof_captured_at numeric
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_branch record;
  v_service record;
  v_policy record;
  v_today date;
  v_distance double precision;
  v_now_ms numeric;
  v_accuracy_limit double precision := 150.0;
  v_proof_ttl_ms numeric := 600000.0;
  v_radius_m double precision;
  v_waiting_count integer;
  v_ahead_at_join integer;
  v_number integer;
  v_code text;
  v_token_id text;
begin
  if v_user_id is null then
    raise exception 'not_signed_in';
  end if;

  -- 1. Check user has no active token
  if exists (
    select 1 from tokens
    where user_id = v_user_id
      and served_at is null
      and missed_at is null
      and left_at is null
  ) then
    raise exception 'already_in_queue';
  end if;

  -- 2. Fetch branch
  select * into v_branch from branches where id = p_branch_id;
  if not found then
    raise exception 'branch_not_found';
  end if;

  -- 3. Fetch service
  select * into v_service from services where id = p_service_id;
  if not found then
    raise exception 'service_not_found';
  end if;

  -- 4. Fetch policy config
  select * into v_policy from policy_config where branch_id = p_branch_id;
  if found then
    v_accuracy_limit := coalesce(v_policy.accuracy_limit_m, 150.0);
    v_proof_ttl_ms := coalesce(v_policy.proof_ttl_ms, 600000.0);
  end if;

  -- 5. Geofence and proximity validation
  v_now_ms := extract(epoch from now()) * 1000.0;
  if (v_now_ms - p_proof_captured_at) > v_proof_ttl_ms or (p_proof_captured_at - v_now_ms) > 60000.0 then
    raise exception 'location_stale';
  end if;

  if p_proof_accuracy is null or p_proof_accuracy > v_accuracy_limit then
    raise exception 'location_inaccurate';
  end if;

  v_radius_m := coalesce(v_branch.join_radius_m, 200.0);
  v_distance := calculate_distance_m(p_proof_lat, p_proof_lng, v_branch.lat, v_branch.lng);
  if v_distance > v_radius_m then
    raise exception 'too_far';
  end if;

  -- 6. Current branch local day
  v_today := (now() at time zone coalesce(v_branch.timezone, 'Asia/Kolkata'))::date;

  -- 7. Get waiting count in group to compute ahead_at_join
  select count(*)::integer into v_waiting_count
  from tokens
  where branch_id = p_branch_id
    and group_id = v_service.group_id
    and day = v_today
    and called_at is null
    and served_at is null
    and missed_at is null
    and left_at is null;

  if cardinality(p_priority) > 0 then
    v_ahead_at_join := greatest(1, round(v_waiting_count * coalesce(v_policy.priority_ahead_factor, 0.3))::integer);
    if v_waiting_count = 0 then
      v_ahead_at_join := 0;
    end if;
  else
    v_ahead_at_join := v_waiting_count;
  end if;

  -- 8. Row lock and advance token sequence
  v_number := next_token_sequence(p_branch_id, v_service.group_id, v_today);

  -- 9. Format code
  select token_prefix into v_code from service_groups where id = v_service.group_id;
  v_code := coalesce(v_code, 'C') || '-' || lpad(v_number::text, 3, '0');

  -- 10. Insert token
  v_token_id := 'tok_' || gen_random_uuid();
  insert into tokens (
    id, code, number, branch_id, group_id, service_id, user_id, source, priority,
    joined_at, ahead_at_join, day
  ) values (
    v_token_id, v_code, v_number, p_branch_id, v_service.group_id, p_service_id, v_user_id, 'walk_in', coalesce(p_priority, '{}'),
    now(), v_ahead_at_join, v_today
  );

  -- 11. Append event
  insert into token_events (token_id, type, actor, meta)
  values (v_token_id, 'joined', 'customer', jsonb_build_object('source', 'walk_in', 'priority', p_priority));

  return v_token_id;
end;
$$;

-- 4. confirm_checkin RPC
create or replace function confirm_checkin(
  p_token_id text,
  p_proof_lat double precision,
  p_proof_lng double precision,
  p_proof_accuracy double precision,
  p_proof_captured_at numeric
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token record;
  v_branch record;
  v_policy record;
  v_distance double precision;
  v_now_ms numeric;
begin
  select * into v_token from tokens where id = p_token_id;
  if not found then
    raise exception 'token_not_found';
  end if;

  if v_user_id is not null and v_token.user_id <> v_user_id then
    raise exception 'token_not_found';
  end if;

  select * into v_branch from branches where id = v_token.branch_id;
  select * into v_policy from policy_config where branch_id = v_token.branch_id;

  v_now_ms := extract(epoch from now()) * 1000.0;
  if (v_now_ms - p_proof_captured_at) > coalesce(v_policy.proof_ttl_ms, 600000.0) then
    raise exception 'location_stale';
  end if;

  if p_proof_accuracy is null or p_proof_accuracy > coalesce(v_policy.accuracy_limit_m, 150.0) then
    raise exception 'location_inaccurate';
  end if;

  v_distance := calculate_distance_m(p_proof_lat, p_proof_lng, v_branch.lat, v_branch.lng);
  if v_distance > coalesce(v_branch.join_radius_m, 200.0) then
    raise exception 'too_far';
  end if;

  update tokens
  set checkin_confirmed_at = now()
  where id = p_token_id;

  insert into token_events (token_id, type, actor)
  values (p_token_id, 'checkin_confirmed', 'customer');

  return true;
end;
$$;

-- 5. move_back RPC
create or replace function move_back(p_token_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token record;
  v_setback integer := 3;
begin
  select * into v_token from tokens where id = p_token_id;
  if not found then
    raise exception 'token_not_found';
  end if;

  if v_user_id is not null and v_token.user_id <> v_user_id then
    raise exception 'token_not_found';
  end if;

  select coalesce(setback, 3) into v_setback from policy_config where branch_id = v_token.branch_id;

  update tokens
  set delay_positions = delay_positions + v_setback,
      checkin_prompted_at = null
  where id = p_token_id;

  insert into token_events (token_id, type, actor, meta)
  values (p_token_id, 'reopened', 'customer', jsonb_build_object('reason', 'move_back', 'setback', v_setback));

  return true;
end;
$$;

-- 6. on_my_way RPC
create or replace function on_my_way(p_token_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token record;
begin
  select * into v_token from tokens where id = p_token_id;
  if not found then
    raise exception 'token_not_found';
  end if;

  if v_user_id is not null and v_token.user_id <> v_user_id then
    raise exception 'token_not_found';
  end if;

  update tokens
  set on_my_way_at = now()
  where id = p_token_id and on_my_way_at is null;

  insert into token_events (token_id, type, actor)
  values (p_token_id, 'nearby', 'customer');

  return true;
end;
$$;

-- 7. request_more_time RPC
create or replace function request_more_time(p_token_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token record;
  v_max_ext integer := 1;
  v_extra_ms numeric := 120000;
begin
  select * into v_token from tokens where id = p_token_id;
  if not found then
    raise exception 'token_not_found';
  end if;

  if v_user_id is not null and v_token.user_id <> v_user_id then
    raise exception 'token_not_found';
  end if;

  select coalesce(max_extensions, 1), coalesce(extra_time_ms, 120000)
  into v_max_ext, v_extra_ms
  from policy_config where branch_id = v_token.branch_id;

  if v_token.extension_count >= v_max_ext then
    raise exception 'no_more_time';
  end if;

  update tokens
  set extra_time_ms = extra_time_ms + v_extra_ms,
      extension_count = extension_count + 1
  where id = p_token_id;

  return true;
end;
$$;

-- 8. leave_queue RPC
create or replace function leave_queue(p_token_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token record;
begin
  select * into v_token from tokens where id = p_token_id;
  if not found then
    raise exception 'token_not_found';
  end if;

  if v_user_id is not null and v_token.user_id <> v_user_id then
    raise exception 'token_not_found';
  end if;

  update tokens
  set left_at = now()
  where id = p_token_id and left_at is null;

  insert into token_events (token_id, type, actor)
  values (p_token_id, 'left', 'customer');

  return true;
end;
$$;

-- 9. send_token_feedback RPC
create or replace function send_token_feedback(p_token_id text, p_feedback text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token record;
begin
  select * into v_token from tokens where id = p_token_id;
  if not found then
    raise exception 'token_not_found';
  end if;

  if v_user_id is not null and v_token.user_id <> v_user_id then
    raise exception 'token_not_found';
  end if;

  update tokens
  set feedback = p_feedback
  where id = p_token_id;

  return true;
end;
$$;
