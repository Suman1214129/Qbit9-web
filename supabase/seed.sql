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
