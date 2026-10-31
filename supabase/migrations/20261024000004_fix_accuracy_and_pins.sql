-- Migration: 20261024000004_fix_accuracy_and_pins.sql
-- 1. Set accuracy_limit_m = 2500 for ALL branches so the join_queue RPC
--    accepts GPS readings up to 2500 m inaccuracy (covers typical indoor Wi-Fi GPS).
-- 2. Fix staff PIN hashing for Khokhra and Saroda branches (stored as plaintext before).

-- 1. Upsert policy_config with high accuracy limit for every branch
insert into policy_config (branch_id, accuracy_limit_m)
select id, 2500
from branches
on conflict (branch_id) do update
  set accuracy_limit_m = 2500;

-- 2. Fix Khokhra branch staff PIN hashes (were stored as plaintext '4821')
update staff
set pin_hash = crypt('4821', gen_salt('bf'))
where branch_id = 'br_bob_khokhra'
  and employee_id in ('E77001', 'E77002', 'E77003');

-- 3. Fix Saroda (Bank of India) branch staff PIN hashes
update staff
set pin_hash = crypt('7362', gen_salt('bf'))
where employee_id = 'E91043' and branch_id = 'br_boi_saroda';

update staff
set pin_hash = crypt('5819', gen_salt('bf'))
where employee_id = 'E91044' and branch_id = 'br_boi_saroda';

update staff
set pin_hash = crypt('3047', gen_salt('bf'))
where employee_id = 'E91045' and branch_id = 'br_boi_saroda';

update staff
set pin_hash = crypt('9274', gen_salt('bf'))
where employee_id = 'E91046' and branch_id = 'br_boi_saroda';

-- 4. Clear the October 24 holiday from the old SBI branches so they show as open today
-- (The seed set holidays = ["2026-10-10","2026-10-24"] for the original SBI branches)
update branches
set holidays = '[]'::jsonb
where bank_id = 'bank_sbi'
  and holidays @> '["2026-10-24"]'::jsonb;
