begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id) values ('13200000-0000-0000-0000-000000000001');
insert into public.members(id, auth_user_id, username, full_name_en, system_role, is_active)
values ('23200000-0000-0000-0000-000000000001', '13200000-0000-0000-0000-000000000001', 'switch_owner', 'Switch Owner', 'OWNER', true);
update public.events set is_current=false where is_current;
-- Insert the older event first, then switch back to it after activating the newer.
insert into public.events(id, code, name_en) values
('33200000-0000-0000-0000-000000000001','SWITCH-OLD','Older event'),
('33200000-0000-0000-0000-000000000002','SWITCH-NEW','Newer event');
set local role authenticated;
select set_config('request.jwt.claim.sub','13200000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.set_current_event('83200000-0000-0000-0000-000000000001','33200000-0000-0000-0000-000000000002')$$,'activate newer event');
select lives_ok($$select public.set_current_event('83200000-0000-0000-0000-000000000002','33200000-0000-0000-0000-000000000001')$$,'switch back to older event without duplicate current key');
reset role;
select is((select id from public.events where is_current),'33200000-0000-0000-0000-000000000001'::uuid,'only older event is current');
set local role authenticated;
select lives_ok($$select public.set_current_event('83200000-0000-0000-0000-000000000003','33200000-0000-0000-0000-000000000002')$$,'switch forward again');
select lives_ok($$select public.set_current_event('83200000-0000-0000-0000-000000000002','33200000-0000-0000-0000-000000000001')$$,'retrying old operation is idempotent');
select throws_ok($$select public.set_current_event('83200000-0000-0000-0000-000000000004','33200000-0000-0000-0000-000000000099')$$,'P0001','NOT_FOUND','missing target rejected before deactivation');
reset role;
select is((select id from public.events where is_current),'33200000-0000-0000-0000-000000000002'::uuid,'retry and failed switch retain newer current event');
select is((select count(*) from public.events where is_current),1::bigint,'exactly one current event remains');
set local role authenticated;
select set_config('request.jwt.claim.sub','13200000-0000-0000-0000-000000000099',true);
select throws_ok($$select public.set_current_event('83200000-0000-0000-0000-000000000005','33200000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','non-owner cannot switch events');
reset role;
select * from finish();
rollback;
