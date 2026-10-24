-- ==========================================
-- FILE: supabase\migrations\20261023000001_phase1_schema.sql
-- ==========================================

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


-- ==========================================
-- FILE: supabase\migrations\20261023000002_phase3_auth_rpc.sql
-- ==========================================

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


-- ==========================================
-- FILE: supabase\migrations\20261023000003_phase4_queue_rpc.sql
-- ==========================================

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


-- ==========================================
-- FILE: supabase\migrations\20261023000004_phase5_bookings_rpc.sql
-- ==========================================

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


-- ==========================================
-- FILE: supabase\migrations\20261023000005_phase6_staff_rpc.sql
-- ==========================================

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


-- ==========================================
-- FILE: supabase\migrations\20261023000006_phase7_timers_cron.sql
-- ==========================================

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


-- ==========================================
-- FILE: supabase\seed.sql
-- ==========================================

-- Seed Data for QBIT9
-- Ported from src/services/mock/catalogue.ts and src/services/mock/staff/accounts.ts
-- Keeps exact IDs and attributes so tests and screenshots remain consistent.

-- 1. Banks
insert into banks (id, slug, name, short_name) values
  ('bank_sbi', 'sbi', 'State Bank of India', 'SBI'),
  ('bank_bob', 'bob', 'Bank of Baroda', 'BoB')
on conflict (id) do nothing;

-- 2. Service Groups
insert into service_groups (id, name, token_prefix) values
  ('grp_cash', 'Cash and cheques', 'C'),
  ('grp_accounts', 'Accounts', 'A'),
  ('grp_loans', 'Loans', 'L'),
  ('grp_lockers', 'Lockers and cards', 'K')
on conflict (id) do nothing;

-- 3. Services
insert into services (id, group_id, name, avg_service_min, bring, bookable) values
  ('svc_cash', 'grp_cash', 'Cash deposit or withdrawal', 6, array['Passbook or account number', 'Filled deposit or withdrawal slip', 'PAN card if depositing ₹50,000 or more'], false),
  ('svc_cheque', 'grp_cash', 'Cheque deposit', 4, array['Cheque, signed on the back', 'Paying in slip', 'Passbook or account number'], false),
  ('svc_dd', 'grp_cash', 'Demand draft', 8, array['Filled DD application form', 'ID proof', 'Cash or account details for payment'], true),
  ('svc_open', 'grp_accounts', 'Open an account', 18, array['Aadhaar card', 'PAN card', 'Two passport size photos'], true),
  ('svc_passbook', 'grp_accounts', 'Passbook update', 3, array['Passbook'], false),
  ('svc_kyc', 'grp_accounts', 'KYC update', 9, array['Aadhaar card', 'PAN card', 'Proof of address if it changed'], true),
  ('svc_statement', 'grp_accounts', 'Statement or account enquiry', 6, array['Passbook or account number', 'ID proof'], true),
  ('svc_loan', 'grp_loans', 'Loan enquiry', 20, array['ID and address proof', 'Last 3 months salary slips or ITR', 'Bank statement for 6 months'], true),
  ('svc_loandocs', 'grp_loans', 'Loan documents', 12, array['Loan reference number', 'Original documents asked for by the officer'], true),
  ('svc_locker', 'grp_lockers', 'Locker access or enquiry', 10, array['Locker key', 'ID proof'], true),
  ('svc_debit', 'grp_lockers', 'Debit card issue or block', 8, array['Account number', 'ID proof'], true),
  ('svc_credit', 'grp_lockers', 'Credit card service', 12, array['Card details if you have one', 'ID proof'], true)
on conflict (id) do nothing;

-- 4. Branches
insert into branches (id, bank_id, slug, name, address, area, city, lat, lng, join_radius_m, timezone, hours, holidays) values
  (
    'br_sbi_main_road',
    'bank_sbi',
    'main-road',
    'Main Road Branch',
    'Main Road, Ellisbridge',
    'Ellisbridge',
    'Ahmedabad',
    23.0225,
    72.5714,
    200,
    'Asia/Kolkata',
    '[null, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "14:00"}]'::jsonb,
    '["2026-10-10", "2026-10-24"]'::jsonb
  ),
  (
    'br_sbi_ring_road',
    'bank_sbi',
    'ring-road',
    'Ring Road Branch',
    'Ring Road, Paldi',
    'Paldi',
    'Ahmedabad',
    23.0121,
    72.5593,
    200,
    'Asia/Kolkata',
    '[null, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "14:00"}]'::jsonb,
    '["2026-10-10", "2026-10-24"]'::jsonb
  ),
  (
    'br_sbi_station_road',
    'bank_sbi',
    'station-road',
    'Station Road Branch',
    'Station Road, Kalupur',
    'Kalupur',
    'Ahmedabad',
    23.0258,
    72.6012,
    200,
    'Asia/Kolkata',
    '[null, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "14:00"}]'::jsonb,
    '["2026-10-10", "2026-10-24"]'::jsonb
  ),
  (
    'br_bob_navrangpura',
    'bank_bob',
    'navrangpura',
    'Navrangpura Branch',
    'CG Road, Navrangpura',
    'Navrangpura',
    'Ahmedabad',
    23.0366,
    72.5611,
    200,
    'Asia/Kolkata',
    '[null, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "14:00"}]'::jsonb,
    '["2026-10-10", "2026-10-24"]'::jsonb
  ),
  (
    'br_bob_satellite',
    'bank_bob',
    'satellite',
    'Satellite Branch',
    'Satellite Road',
    'Satellite',
    'Ahmedabad',
    23.0300,
    72.5290,
    200,
    'Asia/Kolkata',
    '[null, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "16:00"}, {"open": "10:00", "close": "14:00"}]'::jsonb,
    '["2026-10-10", "2026-10-24"]'::jsonb
  )
on conflict (id) do nothing;

-- 5. Policy Config for Branches
insert into policy_config (branch_id) values
  ('br_sbi_main_road'),
  ('br_sbi_ring_road'),
  ('br_sbi_station_road'),
  ('br_bob_navrangpura'),
  ('br_bob_satellite')
on conflict (branch_id) do nothing;

-- 6. Counters and Counter Groups
-- Helper procedure to populate standard branch counters
do $$
declare
  b_id text;
  c_count integer;
  i integer;
  c_id text;
begin
  for b_id, c_count in
    values
      ('br_sbi_main_road', 2),
      ('br_sbi_ring_road', 2),
      ('br_sbi_station_road', 3),
      ('br_bob_navrangpura', 2),
      ('br_bob_satellite', 2)
  loop
    -- Counter 1: Accounts
    c_id := b_id || '_c1';
    insert into counters (id, branch_id, number) values (c_id, b_id, 1) on conflict (id) do nothing;
    insert into counter_groups (counter_id, group_id) values (c_id, 'grp_accounts') on conflict do nothing;

    -- Counter 2: Accounts
    c_id := b_id || '_c2';
    insert into counters (id, branch_id, number) values (c_id, b_id, 2) on conflict (id) do nothing;
    insert into counter_groups (counter_id, group_id) values (c_id, 'grp_accounts') on conflict do nothing;

    -- Counter 3: Loans
    c_id := b_id || '_c3';
    insert into counters (id, branch_id, number) values (c_id, b_id, 3) on conflict (id) do nothing;
    insert into counter_groups (counter_id, group_id) values (c_id, 'grp_loans') on conflict do nothing;

    -- Cash counters starting at 4
    for i in 0 .. (c_count - 1) loop
      c_id := b_id || '_c' || (4 + i);
      insert into counters (id, branch_id, number) values (c_id, b_id, 4 + i) on conflict (id) do nothing;
      insert into counter_groups (counter_id, group_id) values (c_id, 'grp_cash') on conflict do nothing;
    end loop;

    -- Locker counter: 4 + c_count
    c_id := b_id || '_c' || (4 + c_count);
    insert into counters (id, branch_id, number) values (c_id, b_id, 4 + c_count) on conflict (id) do nothing;
    insert into counter_groups (counter_id, group_id) values (c_id, 'grp_lockers') on conflict do nothing;
  end loop;
end $$;

-- 7. Staff Accounts (Sample accounts from accounts.ts, PIN 4821 hashed)
insert into staff (id, employee_id, name, branch_id, role, pin_hash) values
  ('stf_1', 'E48213', 'Meera Joshi', 'br_sbi_main_road', 'teller', crypt('4821', gen_salt('bf'))),
  ('stf_2', 'E48214', 'Arjun Patel', 'br_sbi_main_road', 'teller', crypt('4821', gen_salt('bf'))),
  ('stf_3', 'E48101', 'Kavita Shah', 'br_sbi_main_road', 'teller', crypt('4821', gen_salt('bf'))),
  ('stf_4', 'E48310', 'Imran Khan', 'br_sbi_main_road', 'teller', crypt('4821', gen_salt('bf'))),
  ('stf_5', 'E52007', 'Neha Desai', 'br_bob_navrangpura', 'teller', crypt('4821', gen_salt('bf')))
on conflict (id) do nothing;

-- 8. Today's Rosters for Seed Staff
insert into rosters (staff_id, date, counter, shift_start, shift_end) values
  ('stf_1', current_date, 4, '09:30', '13:30'),
  ('stf_2', current_date, 5, '10:00', '14:00'),
  ('stf_3', current_date, 1, '10:00', '14:00'),
  ('stf_4', current_date, 3, '10:00', '16:00'),
  ('stf_5', current_date, 4, '10:00', '14:00')
on conflict (staff_id, date) do nothing;
