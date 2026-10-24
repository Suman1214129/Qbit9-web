-- Migration: 20261023000004_phase5_bookings_rpc.sql
-- Bookings RPCs: create with capacity lock, cancel, checkin_booking

-- 1. Create booking with capacity lock
create or replace function create_booking(
  p_branch_id text,
  p_service_id text,
  p_starts_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_service record;
  v_branch record;
  v_capacity integer;
  v_booked integer;
  v_booking_id text;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'not_signed_in';
  end if;

  if p_starts_at <= v_now + interval '30 minutes' then
    raise exception 'slot_in_past';
  end if;

  select * into v_branch from branches where id = p_branch_id;
  if not found then
    raise exception 'branch_not_found';
  end if;

  select * into v_service from services where id = p_service_id;
  if not found or not v_service.bookable then
    raise exception 'service_not_found';
  end if;

  -- Check if user already has an active booking at the same time
  if exists (
    select 1 from bookings
    where user_id = v_user_id
      and starts_at = p_starts_at
      and status = 'upcoming'
  ) then
    raise exception 'slot_unavailable';
  end if;

  -- Determine total capacity for this group at this branch
  select count(distinct c.id)::integer into v_capacity
  from counters c
  join counter_groups cg on cg.counter_id = c.id
  where c.branch_id = p_branch_id
    and cg.group_id = v_service.group_id;

  v_capacity := greatest(1, coalesce(v_capacity, 1));

  -- Lock slot capacity row or insert if not present
  insert into slot_capacity (branch_id, service_id, slot_start, capacity, booked_count)
  values (p_branch_id, p_service_id, p_starts_at, v_capacity, 0)
  on conflict (branch_id, service_id, slot_start) do nothing;

  select booked_count into v_booked
  from slot_capacity
  where branch_id = p_branch_id
    and service_id = p_service_id
    and slot_start = p_starts_at
  for update;

  if v_booked >= v_capacity then
    raise exception 'slot_unavailable';
  end if;

  -- Create booking
  v_booking_id := 'bk_' || gen_random_uuid();
  insert into bookings (
    id, user_id, branch_id, service_id, starts_at, duration_min, status, created_at
  ) values (
    v_booking_id, v_user_id, p_branch_id, p_service_id, p_starts_at, coalesce(v_service.avg_service_min, 30), 'upcoming', v_now
  );

  update slot_capacity
  set booked_count = booked_count + 1
  where branch_id = p_branch_id
    and service_id = p_service_id
    and slot_start = p_starts_at;

  return v_booking_id;
end;
$$;

-- 2. Cancel booking
create or replace function cancel_booking(p_booking_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking record;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found';
  end if;

  if v_user_id is not null and v_booking.user_id <> v_user_id then
    raise exception 'booking_not_found';
  end if;

  if v_booking.status <> 'upcoming' or now() > (v_booking.starts_at - interval '30 minutes') then
    raise exception 'booking_not_cancellable';
  end if;

  update bookings
  set status = 'cancelled'
  where id = p_booking_id;

  update slot_capacity
  set booked_count = greatest(0, booked_count - 1)
  where branch_id = v_booking.branch_id
    and service_id = v_booking.service_id
    and slot_start = v_booking.starts_at;

  return true;
end;
$$;

-- 3. checkin_booking RPC
create or replace function checkin_booking(
  p_booking_id text,
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
  v_booking record;
  v_branch record;
  v_service record;
  v_policy record;
  v_distance double precision;
  v_now timestamptz := now();
  v_now_ms numeric;
  v_today date;
  v_number integer;
  v_code text;
  v_token_id text;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found';
  end if;

  if v_user_id is not null and v_booking.user_id <> v_user_id then
    raise exception 'booking_not_found';
  end if;

  if v_booking.status <> 'upcoming' then
    raise exception 'invalid_state';
  end if;

  -- Window check: checkin opens 30 min before and holds until 15 min after slot start
  if v_now < (v_booking.starts_at - interval '30 minutes') or v_now > (v_booking.starts_at + interval '15 minutes') then
    raise exception 'booking_window';
  end if;

  select * into v_branch from branches where id = v_booking.branch_id;
  select * into v_service from services where id = v_booking.service_id;
  select * into v_policy from policy_config where branch_id = v_booking.branch_id;

  v_now_ms := extract(epoch from v_now) * 1000.0;
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

  v_today := (v_now at time zone coalesce(v_branch.timezone, 'Asia/Kolkata'))::date;
  v_number := next_token_sequence(v_booking.branch_id, v_service.group_id, v_today);

  select token_prefix into v_code from service_groups where id = v_service.group_id;
  v_code := coalesce(v_code, 'B') || '-' || lpad(v_number::text, 3, '0');

  v_token_id := 'tok_' || gen_random_uuid();
  insert into tokens (
    id, code, number, branch_id, group_id, service_id, user_id, source, priority,
    joined_at, ahead_at_join, day, booking_id
  ) values (
    v_token_id, v_code, v_number, v_booking.branch_id, v_service.group_id, v_booking.service_id, v_booking.user_id, 'booking', '{}',
    v_now, 0, v_today, p_booking_id
  );

  update bookings
  set status = 'checked_in', token_id = v_token_id
  where id = p_booking_id;

  insert into token_events (token_id, type, actor, meta)
  values (v_token_id, 'joined', 'customer', jsonb_build_object('source', 'booking', 'booking_id', p_booking_id));

  return v_token_id;
end;
$$;
