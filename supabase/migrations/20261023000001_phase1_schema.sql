-- Migration: 20261023000001_phase1_schema.sql
-- Description: Core schema, constraints, indexes, RLS and views for QBIT9
-- Rules: No direct writes from client, all state changes via security definer RPCs, no em dashes.

-- 1. Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- 2. Catalogue Tables
create table if not exists banks (
  id text primary key,
  slug text not null unique,
  name text not null,
  short_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists branches (
  id text primary key,
  bank_id text not null references banks(id) on delete cascade,
  slug text not null,
  name text not null,
  address text not null,
  area text not null,
  city text not null default 'Ahmedabad',
  lat double precision not null,
  lng double precision not null,
  join_radius_m integer not null default 200,
  timezone text not null default 'Asia/Kolkata',
  hours jsonb not null,
  holidays jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_branches_bank_slug unique (bank_id, slug)
);

create table if not exists service_groups (
  id text primary key,
  name text not null,
  token_prefix text not null,
  created_at timestamptz not null default now()
);

create table if not exists services (
  id text primary key,
  group_id text not null references service_groups(id) on delete cascade,
  name text not null,
  avg_service_min integer not null,
  bring text[] not null default '{}',
  bookable boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists counters (
  id text primary key,
  branch_id text not null references branches(id) on delete cascade,
  number integer not null,
  created_at timestamptz not null default now(),
  constraint uq_counters_branch_number unique (branch_id, number)
);

create table if not exists counter_groups (
  counter_id text not null references counters(id) on delete cascade,
  group_id text not null references service_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (counter_id, group_id)
);

-- 3. Policy Configuration per Branch (matches domain/policy.ts and STAFF_POLICY)
create table if not exists policy_config (
  branch_id text primary key references branches(id) on delete cascade,
  accuracy_limit_m integer not null default 150,
  proof_ttl_ms bigint not null default 600000,
  near_threshold integer not null default 3,
  checkin_window_ms bigint not null default 180000,
  setback integer not null default 3,
  max_lapses integer not null default 2,
  called_window_ms bigint not null default 300000,
  extra_time_ms bigint not null default 120000,
  max_extensions integer not null default 1,
  booking_horizon_days integer not null default 7,
  booking_lead_min integer not null default 30,
  slot_minutes integer not null default 30,
  slot_hold_min integer not null default 15,
  booking_checkin_opens_min integer not null default 30,
  cancel_cutoff_min integer not null default 30,
  reminder_min integer not null default 60,
  priority_ahead_factor numeric not null default 0.2,
  booked_max_ahead integer not null default 2,
  max_active_tokens integer not null default 1,
  nudge_factor numeric not null default 2,
  nudge_min_ms bigint not null default 300000,
  snooze_factor numeric not null default 1,
  max_recalls integer not null default 2,
  note_max_length integer not null default 140,
  pin_min_length integer not null default 4,
  pin_max_length integer not null default 6,
  max_pin_attempts integer not null default 5,
  lockout_ms bigint not null default 300000,
  session_ms bigint not null default 28800000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Customer Profiles and Preferences
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  email text,
  alerts jsonb not null default '{"browserAlerts": true, "emailAlerts": true, "smsAlerts": false, "whatsappAlerts": false, "savedBranchIds": [], "lastBranchId": null}'::jsonb,
  priority_tags text[] not null default '{}',
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Bookings and Slot Capacity
create table if not exists bookings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id text not null references branches(id) on delete cascade,
  service_id text not null references services(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min integer not null default 30,
  status text not null default 'upcoming' check (status in ('upcoming', 'checked_in', 'completed', 'cancelled', 'missed')),
  token_id text,
  created_at timestamptz not null default now(),
  constraint uq_booking_user_slot unique (user_id, branch_id, service_id, starts_at)
);

create table if not exists slot_capacity (
  branch_id text not null references branches(id) on delete cascade,
  service_id text not null references services(id) on delete cascade,
  slot_start timestamptz not null,
  capacity integer not null default 1,
  booked_count integer not null default 0,
  primary key (branch_id, service_id, slot_start)
);

-- 6. Tokens and Queue Truth (Tokens store facts, derived fields computed in views)
create table if not exists tokens (
  id text primary key,
  code text not null,
  number integer not null,
  day date not null,
  branch_id text not null references branches(id) on delete cascade,
  group_id text not null references service_groups(id) on delete cascade,
  service_id text not null references services(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'walk_in' check (source in ('walk_in', 'booking')),
  priority text[] not null default '{}',
  joined_at timestamptz not null default now(),
  ahead_at_join integer not null default 0,
  delay_positions integer not null default 0,
  lapse_count integer not null default 0,
  checkin_prompted_at timestamptz,
  checkin_confirmed_at timestamptz,
  called_at timestamptz,
  counter integer,
  on_my_way_at timestamptz,
  extra_time_ms bigint not null default 0,
  extension_count integer not null default 0,
  serving_started_at timestamptz,
  served_at timestamptz,
  missed_at timestamptz,
  left_at timestamptz,
  held boolean not null default false,
  note text,
  recalls integer not null default 0,
  closed_by text check (closed_by is null or closed_by in ('staff', 'auto')),
  feedback text check (feedback is null or feedback in ('quick', 'okay', 'slow')),
  reconciled_at timestamptz not null default now(),
  booking_id text references bookings(id) on delete set null,
  constraint uq_token_branch_group_day_number unique (branch_id, group_id, day, number)
);

-- Foreign key linking bookings to tokens
alter table bookings add constraint fk_bookings_token foreign key (token_id) references tokens(id) on delete set null;

-- Token Sequences for gap-free daily numbering per branch and group
create table if not exists token_sequences (
  branch_id text not null references branches(id) on delete cascade,
  group_id text not null references service_groups(id) on delete cascade,
  day date not null,
  last_number integer not null default 0,
  primary key (branch_id, group_id, day)
);

-- Sequence locking function
create or replace function next_token_sequence(
  p_branch_id text,
  p_group_id text,
  p_day date
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  insert into token_sequences (branch_id, group_id, day, last_number)
  values (p_branch_id, p_group_id, p_day, 1)
  on conflict (branch_id, group_id, day)
  do update set last_number = token_sequences.last_number + 1
  returning last_number into v_next;

  return v_next;
end;
$$;

-- Append-only event stream for tokens
create table if not exists token_events (
  id bigint generated always as identity primary key,
  token_id text not null references tokens(id) on delete cascade,
  type text not null check (type in ('joined', 'nearby', 'checkin_open', 'checkin_confirmed', 'checkin_lapsed', 'checkin_missed', 'called', 'recalled', 'transferred', 'held', 'resumed', 'serving', 'served', 'no_show', 'missed', 'reopened', 'left')),
  actor text not null,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

-- Push subscriptions for web push notifications
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  last_ok_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- 7. Staff, Rosters, Shifts, Breaks, Audit Log
create table if not exists staff (
  id text primary key,
  employee_id text not null unique,
  name text not null,
  branch_id text not null references branches(id) on delete cascade,
  role text not null default 'teller' check (role in ('teller', 'admin')),
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists rosters (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id) on delete cascade,
  date date not null,
  counter integer not null,
  shift_start time not null,
  shift_end time not null,
  created_at timestamptz not null default now(),
  constraint uq_staff_date unique (staff_id, date)
);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references branches(id) on delete cascade,
  counter integer not null,
  day date not null,
  staff_id text not null references staff(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'break', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  break_reason text check (break_reason is null or break_reason in ('lunch', 'tea', 'system_issue')),
  break_started_at timestamptz,
  call_next_presses integer not null default 0,
  nudge_snoozed_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists breaks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id) on delete cascade,
  reason text not null check (reason in ('lunch', 'tea', 'system_issue')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now(),
  ip text
);

-- 8. Indexes (Crucial for live queue and queries performance)
create index if not exists idx_tokens_live_queue
  on tokens (branch_id, group_id, joined_at)
  where called_at is null and served_at is null and missed_at is null and left_at is null;

create index if not exists idx_tokens_user_history
  on tokens (user_id, joined_at desc);

create unique index if not exists idx_tokens_active_per_user
  on tokens (user_id)
  where user_id is not null and served_at is null and missed_at is null and left_at is null;

create index if not exists idx_token_events_token_at
  on token_events (token_id, at);

create unique index if not exists idx_one_open_shift_per_counter_day
  on shifts (branch_id, counter, day)
  where status in ('open', 'break');

create index if not exists idx_bookings_user_starts
  on bookings (user_id, starts_at desc);

create index if not exists idx_push_subs_user
  on push_subscriptions (user_id);

-- 9. Views That Apps Read

-- 9.1 service_waiting: Public waiting counts per service group
create or replace view service_waiting as
with live_waiting_by_group as (
  select
    t.branch_id,
    t.group_id,
    count(*)::integer as waiting_count
  from tokens t
  where t.called_at is null
    and t.served_at is null
    and t.missed_at is null
    and t.left_at is null
    and t.day = (now() at time zone 'Asia/Kolkata')::date
  group by t.branch_id, t.group_id
),
open_counters as (
  select
    cg.group_id,
    s.branch_id,
    count(distinct s.counter)::integer as open_counter_count
  from shifts s
  join counters c on c.branch_id = s.branch_id and c.number = s.counter
  join counter_groups cg on cg.counter_id = c.id
  where s.status = 'open'
    and s.day = (now() at time zone 'Asia/Kolkata')::date
  group by cg.group_id, s.branch_id
),
total_counters as (
  select
    c.branch_id,
    cg.group_id,
    count(distinct c.number)::integer as total_counter_count
  from counters c
  join counter_groups cg on cg.counter_id = c.id
  group by c.branch_id, cg.group_id
)
select
  s.id as service_id,
  s.group_id,
  b.id as branch_id,
  coalesce(w.waiting_count, 0) as waiting,
  coalesce(oc.open_counter_count, 0) as open_counters,
  coalesce(tc.total_counter_count, 1) as total_counters,
  s.avg_service_min
from branches b
cross join services s
left join live_waiting_by_group w on w.branch_id = b.id and w.group_id = s.group_id
left join open_counters oc on oc.branch_id = b.id and oc.group_id = s.group_id
left join total_counters tc on tc.branch_id = b.id and tc.group_id = s.group_id;

-- 9.2 branch_snapshot: Public summary for branch landing pages
create or replace view branch_snapshot as
with branch_groups_waiting as (
  select
    t.branch_id,
    t.group_id,
    count(*)::integer as waiting_count
  from tokens t
  where t.called_at is null
    and t.served_at is null
    and t.missed_at is null
    and t.left_at is null
    and t.day = (now() at time zone 'Asia/Kolkata')::date
  group by t.branch_id, t.group_id
),
branch_sums as (
  select
    b.id as branch_id,
    coalesce(sum(bgw.waiting_count), 0)::integer as waiting_total
  from branches b
  left join branch_groups_waiting bgw on bgw.branch_id = b.id
  group by b.id
)
select
  b.id as branch_id,
  coalesce(bs.waiting_total, 0) as waiting_total,
  15 as usual_wait_min,
  true as is_open,
  '4 pm' as closes_label,
  null::text as opens_label,
  now() as updated_at
from branches b
left join branch_sums bs on bs.branch_id = b.id;

-- 9.3 staff_queue: Live list of waiting, called and serving entries for staff console
create or replace view staff_queue as
select
  t.id,
  t.code,
  t.number,
  coalesce(p.name, t.note) as name,
  s.id as service_id,
  s.name as service_name,
  t.group_id,
  case
    when t.source = 'booking' then 'booking'
    when t.user_id is not null then 'app'
    else 'counter'
  end as origin,
  (t.user_id is not null) as live,
  t.priority,
  extract(epoch from t.joined_at) * 1000 as joined_at,
  extract(epoch from (t.joined_at + ((t.delay_positions * 3) || ' minutes')::interval)) * 1000 as order_at,
  case
    when t.served_at is not null then 'served'
    when t.missed_at is not null then 'no_show'
    when t.left_at is not null then 'left'
    when t.serving_started_at is not null then 'serving'
    when t.called_at is not null then 'called'
    else 'waiting'
  end as status,
  t.held,
  t.counter,
  case when t.called_at is not null then extract(epoch from t.called_at) * 1000 else null end as called_at,
  case when t.serving_started_at is not null then extract(epoch from t.serving_started_at) * 1000 else null end as arrived_at,
  (t.on_my_way_at is not null) as replied,
  case
    when t.called_at is not null then
      extract(epoch from (t.called_at + ((coalesce(pc.called_window_ms, 300000) + t.extra_time_ms) || ' milliseconds')::interval)) * 1000
    else null
  end as call_deadline,
  (t.checkin_prompted_at is not null and t.checkin_confirmed_at is null) as confirming,
  t.note,
  t.recalls,
  case
    when t.served_at is not null then extract(epoch from t.served_at) * 1000
    when t.missed_at is not null then extract(epoch from t.missed_at) * 1000
    when t.left_at is not null then extract(epoch from t.left_at) * 1000
    else null
  end as closed_at,
  t.closed_by,
  s.avg_service_min,
  t.branch_id,
  t.day
from tokens t
join services s on s.id = t.service_id
join branches b on b.id = t.branch_id
left join policy_config pc on pc.branch_id = t.branch_id
left join profiles p on p.id = t.user_id;

-- 9.4 token_view: Reconciled TokenView matching src/domain/types.ts
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
  now() as updated_at,
  t.user_id
from tokens t
join branches b on b.id = t.branch_id
join banks bk on bk.id = b.bank_id
join services s on s.id = t.service_id
left join policy_config pc on pc.branch_id = t.branch_id
left join now_serving_tokens nst on nst.branch_id = t.branch_id and nst.group_id = t.group_id and nst.day = t.day;

-- Helper function token_view(token_id)
create or replace function token_view(p_token_id text)
returns setof token_view
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from token_view where id = p_token_id;
$$;

-- 10. Row Level Security (RLS) Setup
-- Rule: Turn RLS on for every table, grant no direct insert, update or delete to anon or authenticated.
alter table banks enable row level security;
alter table branches enable row level security;
alter table service_groups enable row level security;
alter table services enable row level security;
alter table counters enable row level security;
alter table counter_groups enable row level security;
alter table policy_config enable row level security;
alter table profiles enable row level security;
alter table bookings enable row level security;
alter table slot_capacity enable row level security;
alter table tokens enable row level security;
alter table token_sequences enable row level security;
alter table token_events enable row level security;
alter table push_subscriptions enable row level security;
alter table staff enable row level security;
alter table rosters enable row level security;
alter table shifts enable row level security;
alter table breaks enable row level security;
alter table audit_log enable row level security;

-- Revoke all direct write privileges from anon and authenticated roles
revoke insert, update, delete on all tables in schema public from anon, authenticated;

-- Grant select on public catalogue to anon and authenticated
grant select on banks, branches, service_groups, services, counters, counter_groups, policy_config, slot_capacity to anon, authenticated;
grant select on service_waiting, branch_snapshot, staff_queue, token_view to anon, authenticated;
grant execute on function token_view(text) to anon, authenticated;
grant execute on function next_token_sequence(text, text, date) to authenticated;

-- Policies: Anonymous and Authenticated Public Catalogue Read
create policy "Public read banks" on banks for select using (true);
create policy "Public read branches" on branches for select using (true);
create policy "Public read service_groups" on service_groups for select using (true);
create policy "Public read services" on services for select using (true);
create policy "Public read counters" on counters for select using (true);
create policy "Public read counter_groups" on counter_groups for select using (true);
create policy "Public read policy_config" on policy_config for select using (true);
create policy "Public read slot_capacity" on slot_capacity for select using (true);

-- Policies: Profiles (User reads own profile only)
create policy "Users read own profile" on profiles
  for select using (auth.uid() is not null and auth.uid() = id);

-- Policies: Bookings (User reads own bookings only)
create policy "Users read own bookings" on bookings
  for select using (auth.uid() is not null and auth.uid() = user_id);

-- Policies: Push Subscriptions (User reads own subscriptions only)
create policy "Users read own push_subscriptions" on push_subscriptions
  for select using (auth.uid() is not null and auth.uid() = user_id);

-- Policies: Tokens (Customer reads own token; Staff reads branch tokens)
create policy "Tokens read policy" on tokens
  for select using (
    (auth.uid() is not null and auth.uid() = user_id)
    or
    ((auth.jwt() ->> 'role' = 'staff') and (auth.jwt() ->> 'branch_id' = branch_id))
  );

-- Policies: Token Events (Customer reads own token events; Staff reads branch token events)
create policy "Token events read policy" on token_events
  for select using (
    exists (
      select 1 from tokens t
      where t.id = token_events.token_id
        and (
          (auth.uid() is not null and auth.uid() = t.user_id)
          or
          ((auth.jwt() ->> 'role' = 'staff') and (auth.jwt() ->> 'branch_id' = t.branch_id))
        )
    )
  );

-- Policies: Staff (Staff can read staff members in their branch)
create policy "Staff read branch staff" on staff
  for select using (
    (auth.jwt() ->> 'role' = 'staff') and (auth.jwt() ->> 'branch_id' = branch_id)
  );

-- Policies: Rosters (Staff can read rosters for their branch)
create policy "Staff read rosters" on rosters
  for select using (
    (auth.jwt() ->> 'role' = 'staff') and exists (
      select 1 from staff s
      where s.id = rosters.staff_id and s.branch_id = (auth.jwt() ->> 'branch_id')
    )
  );

-- Policies: Shifts (Staff can read shifts for their branch)
create policy "Staff read branch shifts" on shifts
  for select using (
    (auth.jwt() ->> 'role' = 'staff') and (auth.jwt() ->> 'branch_id' = branch_id)
  );

-- Policies: Breaks (Staff can read breaks for their branch shifts)
create policy "Staff read branch breaks" on breaks
  for select using (
    (auth.jwt() ->> 'role' = 'staff') and exists (
      select 1 from shifts s
      where s.id = breaks.shift_id and s.branch_id = (auth.jwt() ->> 'branch_id')
    )
  );

-- Policies: Audit Log (Bank Admins and Service Role only)
create policy "Admins read audit log" on audit_log
  for select using (
    (auth.jwt() ->> 'role' = 'bank_admin')
  );
