-- Migration: 20261024000003_add_saroda_rai_uni_branch.sql
-- Add Bank of India - Saroda Branch near Rai University, Saroda, Dholka, Ahmedabad.
-- Replaces br_sbi_main_road (Main Road SBI) which is removed.

-- 0. Add Bank of India
insert into banks (id, slug, name, short_name) values
  ('bank_boi', 'boi', 'Bank of India', 'BoI')
on conflict (id) do nothing;

-- 1. REMOVE Main Road SBI Branch (and all its children)
delete from rosters
  where staff_id in (select id from staff where branch_id = 'br_sbi_main_road');
delete from staff      where branch_id = 'br_sbi_main_road';
delete from counter_groups
  where counter_id in (select id from counters where branch_id = 'br_sbi_main_road');
delete from counters   where branch_id = 'br_sbi_main_road';
delete from policy_config where branch_id = 'br_sbi_main_road';
delete from branches   where id = 'br_sbi_main_road';

-- 2. INSERT Bank of India - Saroda Branch
--    Rai University coords: 22.8170, 72.4734
--    Branch at Saroda village Post Office: 22.8195, 72.4710
--    join_radius_m = 2000 covers the full Rai University campus
insert into branches (id, bank_id, slug, name, address, area, city, lat, lng, join_radius_m, timezone, hours, holidays)
values (
  'br_boi_saroda',
  'bank_boi',
  'saroda',
  'Saroda Branch',
  'Near Post Office, Village Saroda, Taluka Dholka',
  'Saroda',
  'Ahmedabad',
  22.8195,
  72.4710,
  2000,
  'Asia/Kolkata',
  '[null, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"16:00"}, {"open":"10:00","close":"14:00"}]'::jsonb,
  '[]'::jsonb
) on conflict (id) do update set
  name          = excluded.name,
  address       = excluded.address,
  lat           = excluded.lat,
  lng           = excluded.lng,
  join_radius_m = excluded.join_radius_m;

-- 3. Policy Config
insert into policy_config (branch_id)
values ('br_boi_saroda')
on conflict (branch_id) do nothing;

-- 4. Counters
insert into counters (id, branch_id, number) values
  ('cnt_boi_saroda_1', 'br_boi_saroda', 1),
  ('cnt_boi_saroda_2', 'br_boi_saroda', 2),
  ('cnt_boi_saroda_3', 'br_boi_saroda', 3),
  ('cnt_boi_saroda_4', 'br_boi_saroda', 4),
  ('cnt_boi_saroda_5', 'br_boi_saroda', 5)
on conflict (id) do nothing;

-- 5. Counter -> Service Group
insert into counter_groups (counter_id, group_id) values
  ('cnt_boi_saroda_1', 'grp_accounts'),
  ('cnt_boi_saroda_2', 'grp_accounts'),
  ('cnt_boi_saroda_3', 'grp_cash'),
  ('cnt_boi_saroda_4', 'grp_loans'),
  ('cnt_boi_saroda_5', 'grp_lockers')
on conflict (counter_id, group_id) do nothing;

-- 6. Staff (random IDs and PINs)
insert into staff (id, employee_id, name, branch_id, role, pin_hash) values
  ('stf_boi_saroda_1', 'E91043', 'Priya Raval',   'br_boi_saroda', 'teller', '7362'),
  ('stf_boi_saroda_2', 'E91044', 'Kiran Solanki', 'br_boi_saroda', 'teller', '5819'),
  ('stf_boi_saroda_3', 'E91045', 'Dhruvit Bhatt', 'br_boi_saroda', 'teller', '3047'),
  ('stf_boi_saroda_4', 'E91046', 'Swati Patel',   'br_boi_saroda', 'admin',  '9274')
on conflict (id) do update set
  name     = excluded.name,
  role     = excluded.role,
  pin_hash = excluded.pin_hash;

-- 7. Today rosters
insert into rosters (staff_id, date, counter, shift_start, shift_end) values
  ('stf_boi_saroda_1', current_date, 1, '09:30', '13:30'),
  ('stf_boi_saroda_2', current_date, 3, '10:00', '14:00'),
  ('stf_boi_saroda_3', current_date, 2, '10:00', '16:00'),
  ('stf_boi_saroda_4', current_date, 4, '10:00', '14:00')
on conflict (staff_id, date) do nothing;
