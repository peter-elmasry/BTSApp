begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id) select ('1f000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role,is_active)
select ('2f000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
('1f000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'palette_test_'||n,'Palette Test '||n,
case when n=1 then 'OWNER' else 'MEMBER' end,true from generate_series(1,3) n;
insert into public.events(id,code,name_en) values
('3f000000-0000-0000-0000-000000000001','PAL-ONE','Palette'),
('3f000000-0000-0000-0000-000000000002','PAL-TWO','Other');
insert into public.event_roles(event_id,member_id,role) values
('3f000000-0000-0000-0000-000000000001','2f000000-0000-0000-0000-000000000002','EVENT_ADMIN'),
('3f000000-0000-0000-0000-000000000001','2f000000-0000-0000-0000-000000000003','REFEREE');
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex,final_tiebreak_pos) values
('4f000000-0000-0000-0000-000000000001','3f000000-0000-0000-0000-000000000001','T01','Rose','falcon','#ABCDEF',1);
-- Roster insertion invalidates ties; establish the baseline after that trigger runs.
update public.teams set final_tiebreak_pos=1 where id='4f000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','1f000000-0000-0000-0000-000000000002',true);
select is(public.set_team_palette('9f000000-0000-0000-0000-000000000001','3f000000-0000-0000-0000-000000000001','[{"name":" Rose ","hex":" #abcDEF "}]'),'[{"name":"Rose","hex":"#ABCDEF"}]'::jsonb,'admin normalizes named HEX palette');
select is(public.get_event_setup('3f000000-0000-0000-0000-000000000001')->'event'->'team_palette','[{"name":"Rose","hex":"#ABCDEF"}]'::jsonb,'setup returns saved palette');
select is(public.set_team_palette('9f000000-0000-0000-0000-000000000001','3f000000-0000-0000-0000-000000000001','[]'),'[{"name":"Rose","hex":"#ABCDEF"}]'::jsonb,'replay retains prior result');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','{}')$$,'P0001','INVALID_PALETTE','non-array rejected');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','["bad"]')$$,'P0001','INVALID_PALETTE','non-object entry rejected');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','[{"name":"Rose","hex":"#abc"}]')$$,'P0001','INVALID_PALETTE','shorthand rejected');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','[{"name":"Rose","hex":"rgb(0,0,0)"}]')$$,'P0001','INVALID_PALETTE','CSS function rejected');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','[{"name":"Rose","hex":"#ABCDEF"},{"name":"rose","hex":"#123456"}]')$$,'P0001','INVALID_PALETTE','case-insensitive duplicate name rejected');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','[{"name":"Rose","hex":"#abcdef"},{"name":"Other","hex":"#ABCDEF"}]')$$,'P0001','INVALID_PALETTE','case-insensitive duplicate HEX rejected');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','[{"name":"Rose","hex":"#ABCDEF","extra":1}]')$$,'P0001','INVALID_PALETTE','unknown field rejected');
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000002','[]')$$,'P0001','FORBIDDEN','admin cannot configure another event');
select lives_ok($$select public.set_team_palette('9f000000-0000-0000-0000-000000000002','3f000000-0000-0000-0000-000000000001','[]')$$,'admin removes swatch');
select set_config('request.jwt.claim.sub','1f000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','[]')$$,'P0001','FORBIDDEN','referee cannot configure palette');
select set_config('request.jwt.claim.sub','1f000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.set_team_palette('9f000000-0000-0000-0000-000000000003','3f000000-0000-0000-0000-000000000002','[]')$$,'owner configures another event');
reset role;
select is((select color_hex from public.teams where id='4f000000-0000-0000-0000-000000000001'),'#ABCDEF','removing palette preserves team HEX');
select is((select final_tiebreak_pos from public.teams where id='4f000000-0000-0000-0000-000000000001'),1,'palette edits do not invalidate tie order');
select is((select count(*)::int from public.audit_log where event_id='3f000000-0000-0000-0000-000000000001' and action='TEAM_PALETTE_UPDATED'),2,'logical changes audited once');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_ok($$select public.set_team_palette(gen_random_uuid(),'3f000000-0000-0000-0000-000000000001','[]')$$,'42501',null,'anonymous cannot configure palette');
reset role;
select * from finish();
rollback;
