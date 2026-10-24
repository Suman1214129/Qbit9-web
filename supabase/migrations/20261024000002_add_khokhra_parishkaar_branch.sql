-- Migration: 20261024000002_add_khokhra_parishkaar_branch.sql
-- Add Bank of Baroda - Khokhra Parishkaar Branch near Parishkaar 2 Phase 2 Khokhra Circle, Ahmedabad
-- and provision staff members.

-- 1. Insert Branch
insert into branches (
  id, bank_id, slug, name, address, area, city, lat, lng, join_radius_m, timezone, hours, holidays
) values (
  'br_bob_khokhra',
  'bank_bob',
  'khokhra-parishkaar',
  'Khokhra Parishkaar Branch',
  'Shop No. 3 to 5, Trade Square, Near Arvind Safal Parishkaar 2, Khokhra Circle',
  'Khokhra',
  'Ahmedabad',
  22.9968,
  72.6138,
  400,
  'Asia/Kolkata',
  '[null, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"22:00"}]'::jsonb,
  '[]'::jsonb
) on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  join_radius_m = excluded.join_radius_m;

-- 2. Insert Policy Config
insert into policy_config (branch_id)
values ('br_bob_khokhra')
on conflict (branch_id) do nothing;

-- 3. Insert Counters
insert into counters (id, branch_id, number) values
  ('cnt_bob_khokhra_1', 'br_bob_khokhra', 1),
  ('cnt_bob_khokhra_2', 'br_bob_khokhra', 2),
  ('cnt_bob_khokhra_3', 'br_bob_khokhra', 3),
  ('cnt_bob_khokhra_4', 'br_bob_khokhra', 4),
  ('cnt_bob_khokhra_5', 'br_bob_khokhra', 5)
on conflict (id) do nothing;

-- 4. Map Counters to Service Groups
insert into counter_groups (counter_id, group_id) values
  ('cnt_bob_khokhra_1', 'grp_cash'),
  ('cnt_bob_khokhra_2', 'grp_cash'),
  ('cnt_bob_khokhra_2', 'grp_accounts'),
  ('cnt_bob_khokhra_3', 'grp_accounts'),
  ('cnt_bob_khokhra_4', 'grp_loans'),
  ('cnt_bob_khokhra_5', 'grp_lockers')
on conflict (counter_id, group_id) do nothing;

-- 5. Insert Staff Members
insert into staff (id, employee_id, name, branch_id, role, pin_hash) values
  ('stf_khokhra_1', 'E77001', 'Hardik Patel', 'br_bob_khokhra', 'teller', '4821'),
  ('stf_khokhra_2', 'E77002', 'Pooja Sharma', 'br_bob_khokhra', 'teller', '4821'),
  ('stf_khokhra_3', 'E77003', 'Vikas Mehra', 'br_bob_khokhra', 'admin', '4821')
on conflict (id) do update set
  name = excluded.name,
  branch_id = excluded.branch_id,
  role = excluded.role,
  pin_hash = excluded.pin_hash;
