begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id) values
  ('18000000-0000-0000-0000-000000000001'), ('18000000-0000-0000-0000-000000000002');
insert into public.members(id, auth_user_id, username, full_name_en, must_change_password) values
  ('28000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', 'pw_temp', 'Temp', true),
  ('28000000-0000-0000-0000-000000000002', '18000000-0000-0000-0000-000000000002', 'pw_done', 'Done', default);

select col_not_null('public', 'members', 'must_change_password', 'flag is never null');
select col_default_is('public', 'members', 'must_change_password', 'false', 'new members are not forced by default');

set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-0000-0000-000000000001', true);
select is((public.get_my_profile() ->> 'must_change_password')::boolean, true, 'profile exposes a pending password change');
select set_config('request.jwt.claim.sub', '18000000-0000-0000-0000-000000000002', true);
select is((public.get_my_profile() ->> 'must_change_password')::boolean, false, 'profile reports no pending change');
reset role;

set local role authenticated;
select throws_ok(
  $$update public.members set must_change_password = false where id = '28000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'members cannot clear the flag directly'
);
reset role;

select * from finish();
rollback;
