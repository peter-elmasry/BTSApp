begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Call RPCs as clients; inspect persisted rows only as the test runner.
-- Count this suite's fixtures so pre-existing seeded owners are harmless.

insert into auth.users(id)
select ('11000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1, 6) n;
insert into public.members(id, auth_user_id, username, full_name_en, system_role, is_active)
select ('21000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       case when n = 5 then null else ('11000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid end,
       'owner_test_' || n, 'Owner Test ' || n,
       case when n = 1 then 'OWNER' else 'MEMBER' end,
       n <> 6
from generate_series(1, 6) n;
insert into public.events(id, code, name_en)
values ('31000000-0000-0000-0000-000000000001', 'P1-BASE', 'Phase One Base');
insert into public.event_roles(event_id, member_id, role)
values ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', 'REFEREE');

set local role anon;
select throws_ok('select public.list_members()', '42501', null, 'anonymous cannot list members');
select throws_ok('select public.list_events()', '42501', null, 'anonymous cannot list events');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
select is(public.get_my_profile() ->> 'username', 'owner_test_3', 'staff can read their own profile');
select throws_ok('select public.list_members()', 'P0001', 'FORBIDDEN', 'referee cannot list members');
select throws_ok('select public.list_events()', 'P0001', 'FORBIDDEN', 'referee cannot list events');
select throws_ok(
  $$select public.create_event('81000000-0000-0000-0000-000000000001', 'REF-FAIL', 'Denied')$$,
  'P0001', 'FORBIDDEN', 'referee cannot create events'
);
select throws_ok(
  $$select public.assign_event_admin('81000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000004')$$,
  'P0001', 'FORBIDDEN', 'referee cannot assign event admins'
);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000006', true);
select throws_ok('select public.get_my_profile()', 'P0001', 'UNAUTHORIZED', 'inactive members cannot load a profile');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is(public.is_owner(), true, 'owner is recognized by the server');
select is((select count(*)::int from jsonb_array_elements(public.list_members()) m where starts_with(m->>'username', 'owner_test_')), 6, 'owner can list members');
select is((select count(*)::int from jsonb_array_elements(public.list_events()) e where e->>'code' = 'P1-BASE'), 1, 'owner can list events');
select is(public.get_my_profile() ->> 'system_role', 'OWNER', 'profile identifies owner role');

select public.create_event('82000000-0000-0000-0000-000000000001', 'P1-NEW', 'Phase One Event');
reset role;
select is((select count(*) from public.events where code = 'P1-NEW'), 1::bigint, 'create event writes one row');
set local role authenticated;
select public.create_event('82000000-0000-0000-0000-000000000001', 'P1-IGNORED', 'Retry');
reset role;
select is((select count(*) from public.events where code in ('P1-NEW', 'P1-IGNORED')), 1::bigint, 'create event retry is idempotent');
set local role authenticated;

select public.set_current_event('82000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001');
reset role;
select is((select count(*) from public.events where is_current), 1::bigint, 'set current event leaves exactly one current event');
set local role authenticated;
select public.assign_event_admin('82000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000004');
reset role;
select is((select count(*) from public.event_roles where event_id = '31000000-0000-0000-0000-000000000001' and member_id = '21000000-0000-0000-0000-000000000004' and role = 'EVENT_ADMIN'), 1::bigint, 'owner can assign a login-enabled member as event admin');
set local role authenticated;
select public.assign_event_admin('82000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000004');
reset role;
select is((select count(*) from public.event_roles where event_id = '31000000-0000-0000-0000-000000000001' and member_id = '21000000-0000-0000-0000-000000000004' and role = 'EVENT_ADMIN'), 1::bigint, 'event admin assignment retry is idempotent');
set local role authenticated;
select throws_ok(
  $$select public.assign_event_admin('82000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000005')$$,
  'P0001', 'MEMBER_NO_LOGIN', 'owner cannot assign a member without sign-in as event admin'
);
select public.remove_event_admin('82000000-0000-0000-0000-000000000005', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000004');
reset role;
select is((select count(*) from public.event_roles where event_id = '31000000-0000-0000-0000-000000000001' and member_id = '21000000-0000-0000-0000-000000000004' and role = 'EVENT_ADMIN'), 0::bigint, 'owner can remove event admin assignment');

select * from finish();
rollback;
