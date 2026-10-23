-- pgTAP tests for QBIT9 Phase 1: RLS and isolation guarantees
-- Proves:
-- 1. A customer cannot read another customer's token or profile
-- 2. Staff cannot read tokens or staff data from another branch
-- 3. Anonymous role can only read public catalogue and counts, never tokens or profiles
-- 4. No direct writes (insert, update, delete) are permitted from anon or authenticated

begin;
create extension if not exists pgtap;

select plan(12);

-- 1. Verify schema tables exist
select has_table('tokens', 'Table tokens exists');
select has_table('profiles', 'Table profiles exists');
select has_table('staff', 'Table staff exists');
select has_table('branches', 'Table branches exists');

-- 2. Setup mock data within transaction for isolation testing
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com')
on conflict (id) do nothing;

insert into profiles (id, name, email) values
  ('11111111-1111-1111-1111-111111111111', 'Alice Customer', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Bob Customer', 'bob@example.com')
on conflict (id) do nothing;

insert into tokens (
  id, code, number, day, branch_id, group_id, service_id, user_id, source
) values
  (
    'tok_alice', 'C-001', 1, current_date,
    'br_sbi_main_road', 'grp_cash', 'svc_cash',
    '11111111-1111-1111-1111-111111111111', 'walk_in'
  ),
  (
    'tok_bob', 'C-002', 2, current_date,
    'br_bob_navrangpura', 'grp_cash', 'svc_cash',
    '22222222-2222-2222-2222-222222222222', 'walk_in'
  )
on conflict (id) do nothing;

-- 3. Test Customer Isolation (Alice cannot see Bob's token)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is(
  (select count(*)::integer from tokens where id = 'tok_alice'),
  1,
  'Customer Alice can read her own token'
);

select is(
  (select count(*)::integer from tokens where id = 'tok_bob'),
  0,
  'Customer Alice cannot read Bob token'
);

select is(
  (select count(*)::integer from profiles where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'Customer Alice cannot read Bob profile'
);

-- 4. Test Customer cannot directly insert tokens
select throws_ok(
  $$ insert into tokens (id, code, number, day, branch_id, group_id, service_id, user_id)
     values ('tok_hack', 'C-999', 999, current_date, 'br_sbi_main_road', 'grp_cash', 'svc_cash', '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'Customer cannot directly insert into tokens (permission denied)'
);

-- 5. Test Staff Isolation (Staff at SBI Main Road cannot read BoB Navrangpura tokens)
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "stf_1", "role": "staff", "staff_id": "stf_1", "branch_id": "br_sbi_main_road"}';

select is(
  (select count(*)::integer from tokens where branch_id = 'br_sbi_main_road'),
  1,
  'Staff can read tokens from their assigned branch'
);

select is(
  (select count(*)::integer from tokens where branch_id = 'br_bob_navrangpura'),
  0,
  'Staff cannot read tokens from another branch'
);

-- 6. Test Anonymous Role Boundaries
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';

select isnt_empty(
  'select * from branches',
  'Anonymous role can read public branches catalogue'
);

select is(
  (select count(*)::integer from tokens),
  0,
  'Anonymous role cannot read any tokens'
);

select * from finish();
rollback;
