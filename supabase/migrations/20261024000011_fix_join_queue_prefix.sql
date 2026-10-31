-- Migration: 20261024000011_fix_join_queue_prefix.sql
-- Fixes token_prefix lookup in join_queue: token_prefix belongs to service_groups, not services

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
  v_accuracy_limit double precision := 5000.0;
  v_proof_ttl_ms numeric := 3600000.0;
  v_radius_m double precision;
  v_waiting_count integer;
  v_ahead_at_join integer;
  v_number integer;
  v_prefix text;
  v_code text;
  v_token_id text;
  v_user_name text;
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
    v_accuracy_limit := coalesce(v_policy.accuracy_limit_m, 5000.0);
    v_proof_ttl_ms := coalesce(v_policy.proof_ttl_ms, 3600000.0);
  end if;

  -- 5. Geofence and proximity validation
  v_now_ms := extract(epoch from now()) * 1000.0;
  if (v_now_ms - p_proof_captured_at) > v_proof_ttl_ms or (p_proof_captured_at - v_now_ms) > 60000.0 then
    raise exception 'location_stale';
  end if;

  if p_proof_accuracy is null or p_proof_accuracy > v_accuracy_limit then
    raise exception 'location_inaccurate';
  end if;

  v_radius_m := coalesce(v_branch.join_radius_m, 50000.0);
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

  -- 9. Mint token code: lookup token_prefix from service_groups
  select token_prefix into v_prefix from service_groups where id = v_service.group_id;
  v_code := coalesce(v_prefix, 'C') || '-' || lpad(v_number::text, 3, '0');
  v_token_id := 'tok_' || gen_random_uuid();

  -- Get customer name from profile
  select name into v_user_name from profiles where id = v_user_id;

  -- 10. Insert token row
  insert into tokens (
    id, code, number, branch_id, group_id, service_id, user_id, source, priority,
    joined_at, ahead_at_join, day, note
  ) values (
    v_token_id, v_code, v_number, p_branch_id, v_service.group_id, p_service_id, v_user_id, 'walk_in', coalesce(p_priority, '{}'),
    now(), v_ahead_at_join, v_today, v_user_name
  );

  -- 11. Append event
  insert into token_events (token_id, type, actor, meta)
  values (v_token_id, 'joined', 'customer', jsonb_build_object('source', 'walk_in', 'priority', p_priority));

  return v_token_id;
end;
$$;

grant execute on function join_queue(text, text, text[], double precision, double precision, double precision, numeric) to authenticated;
