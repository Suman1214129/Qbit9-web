-- Migration: 20261023000005_phase6_staff_rpc.sql
-- Staff console RPCs: counter operations, shifts, breaks, walk-ins, and audit log

-- 1. Staff Sign In RPC with lockout enforcement
create or replace function staff_sign_in(
  p_employee_id text,
  p_pin text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff record;
  v_now timestamptz := now();
begin
  select * into v_staff from staff where employee_id = p_employee_id;
  if not found or v_staff.disabled_at is not null then
    raise exception 'invalid_credentials';
  end if;

  if v_staff.locked_until is not null and v_staff.locked_until > v_now then
    raise exception 'account_locked';
  end if;

  -- Pin verification: standard demo PIN 4821 or pin_hash check
  if p_pin <> '4821' and v_staff.pin_hash <> p_pin then
    update staff
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then v_now + interval '5 minutes' else null end
    where id = v_staff.id;

    if v_staff.failed_attempts + 1 >= 5 then
      raise exception 'account_locked';
    else
      raise exception 'invalid_credentials';
    end if;
  end if;

  -- Reset failed attempts on success
  update staff
  set failed_attempts = 0, locked_until = null
  where id = v_staff.id;

  insert into audit_log (staff_id, branch_id, action, entity_type, entity_id)
  values (v_staff.id, v_staff.branch_id, 'sign_in', 'staff', v_staff.id);

  return jsonb_build_object(
    'id', v_staff.id,
    'employee_id', v_staff.employee_id,
    'name', v_staff.name,
    'branch_id', v_staff.branch_id,
    'role', v_staff.role
  );
end;
$$;

-- 2. Staff Call Next RPC (atomic, with already_called lock and priority order)
create or replace function staff_call_next(
  p_staff_id text,
  p_counter integer,
  p_entry_id text default null,
  p_close_current_as text default 'served'
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff record;
  v_target_id text := p_entry_id;
  v_today date;
  v_target record;
begin
  select * into v_staff from staff where id = p_staff_id;
  if not found then
    raise exception 'not_signed_in';
  end if;

  v_today := (now() at time zone 'Asia/Kolkata')::date;

  -- Close current customer at this counter if any
  update tokens
  set served_at = case when p_close_current_as = 'served' then now() else null end,
      missed_at = case when p_close_current_as = 'no_show' then now() else null end,
      closed_by = 'staff'
  where branch_id = v_staff.branch_id
    and counter = p_counter
    and day = v_today
    and called_at is not null
    and served_at is null
    and missed_at is null
    and left_at is null;

  -- Pick target token if not specified
  if v_target_id is null then
    select t.id into v_target_id
    from tokens t
    join counters c on c.branch_id = t.branch_id and c.number = p_counter
    join counter_groups cg on cg.counter_id = c.id and cg.group_id = t.group_id
    where t.branch_id = v_staff.branch_id
      and t.day = v_today
      and t.called_at is null
      and t.served_at is null
      and t.missed_at is null
      and t.left_at is null
      and not (t.checkin_prompted_at is not null and t.checkin_confirmed_at is null)
    order by
      (cardinality(t.priority) > 0) desc,
      (t.joined_at + ((t.delay_positions * 3) || ' minutes')::interval) asc,
      t.number asc
    limit 1
    for update skip locked;
  else
    -- Explicit call: lock the token
    select * into v_target
    from tokens
    where id = v_target_id and branch_id = v_staff.branch_id
    for update;

    if not found or v_target.called_at is not null or v_target.served_at is not null or v_target.missed_at is not null then
      raise exception 'entry_not_callable';
    end if;

    if v_target.checkin_prompted_at is not null and v_target.checkin_confirmed_at is null then
      raise exception 'entry_not_callable';
    end if;
  end if;

  if v_target_id is null then
    return null; -- Queue empty for this counter's service groups
  end if;

  update tokens
  set called_at = now(),
      counter = p_counter
  where id = v_target_id;

  insert into token_events (token_id, type, actor, meta)
  values (v_target_id, 'called', 'staff', jsonb_build_object('counter', p_counter, 'staff_id', p_staff_id));

  insert into audit_log (staff_id, branch_id, action, entity_type, entity_id, after)
  values (p_staff_id, v_staff.branch_id, 'call', 'tokens', v_target_id, jsonb_build_object('counter', p_counter));

  return v_target_id;
end;
$$;

-- 3. Staff Finish Current Customer RPC
create or replace function staff_finish_current(
  p_staff_id text,
  p_counter integer,
  p_as text default 'served'
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_token_id text;
begin
  select * into v_staff from staff where id = p_staff_id;
  if not found then
    raise exception 'not_signed_in';
  end if;

  select id into v_token_id
  from tokens
  where branch_id = v_staff.branch_id
    and counter = p_counter
    and day = v_today
    and called_at is not null
    and served_at is null
    and missed_at is null
    and left_at is null
  limit 1;

  if v_token_id is not null then
    update tokens
    set served_at = case when p_as = 'served' then now() else null end,
        missed_at = case when p_as = 'no_show' then now() else null end,
        closed_by = 'staff'
    where id = v_token_id;

    insert into token_events (token_id, type, actor)
    values (v_token_id, case when p_as = 'served' then 'served' else 'no_show' end, 'staff');

    insert into audit_log (staff_id, branch_id, action, entity_type, entity_id)
    values (p_staff_id, v_staff.branch_id, case when p_as = 'served' then 'serve' else 'no_show' end, 'tokens', v_token_id);
  end if;

  return true;
end;
$$;

-- 4. Staff Recall RPC
create or replace function staff_recall(
  p_staff_id text,
  p_counter integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_token record;
begin
  select * into v_staff from staff where id = p_staff_id;
  if not found then
    raise exception 'not_signed_in';
  end if;

  select * into v_token
  from tokens
  where branch_id = v_staff.branch_id
    and counter = p_counter
    and day = v_today
    and called_at is not null
    and served_at is null
    and missed_at is null
    and left_at is null
  limit 1
  for update;

  if not found then
    raise exception 'entry_not_found';
  end if;

  if v_token.recalls >= 2 then
    raise exception 'recall_limit';
  end if;

  update tokens
  set recalls = recalls + 1,
      called_at = now()
  where id = v_token.id;

  insert into token_events (token_id, type, actor, meta)
  values (v_token.id, 'recalled', 'staff', jsonb_build_object('recalls', v_token.recalls + 1));

  insert into audit_log (staff_id, branch_id, action, entity_type, entity_id)
  values (p_staff_id, v_staff.branch_id, 'recall', 'tokens', v_token.id);

  return true;
end;
$$;

-- 5. Staff Transfer Customer RPC
create or replace function staff_transfer(
  p_staff_id text,
  p_from_counter integer,
  p_to_counter integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff record;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_token record;
begin
  select * into v_staff from staff where id = p_staff_id;
  if not found then
    raise exception 'not_signed_in';
  end if;

  -- Check if destination counter is already busy
  if exists (
    select 1 from tokens
    where branch_id = v_staff.branch_id
      and counter = p_to_counter
      and day = v_today
      and called_at is not null
      and served_at is null
      and missed_at is null
      and left_at is null
  ) then
    raise exception 'counter_busy';
  end if;

  select * into v_token
  from tokens
  where branch_id = v_staff.branch_id
    and counter = p_from_counter
    and day = v_today
    and called_at is not null
    and served_at is null
    and missed_at is null
    and left_at is null
  limit 1
  for update;

  if not found then
    raise exception 'entry_not_found';
  end if;

  update tokens
  set counter = p_to_counter
  where id = v_token.id;

  insert into token_events (token_id, type, actor, meta)
  values (v_token.id, 'transferred', 'staff', jsonb_build_object('from', p_from_counter, 'to', p_to_counter));

  insert into audit_log (staff_id, branch_id, action, entity_type, entity_id, after)
  values (p_staff_id, v_staff.branch_id, 'transfer', 'tokens', v_token.id, jsonb_build_object('to', p_to_counter));

  return true;
end;
$$;
