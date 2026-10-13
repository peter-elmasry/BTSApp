begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- D055: signed-in members read Guides and Referees with phones; visitors cannot.
insert into auth.users(id) values ('1e000000-0000-0000-0000-000000000001'),('1e000000-0000-0000-0000-000000000002'),('1e000000-0000-0000-0000-000000000003');
insert into public.members(id,auth_user_id,username,phone,full_name_en,is_active) values
('2e000000-0000-0000-0000-000000000001','1e000000-0000-0000-0000-000000000001','dir_guide','+201000000101','Dir Guide',true),
('2e000000-0000-0000-0000-000000000002','1e000000-0000-0000-0000-000000000002','dir_ref','+201000000102','Dir Ref',true),
('2e000000-0000-0000-0000-000000000003','1e000000-0000-0000-0000-000000000003','dir_off','+201000000103','Dir Off',false);
insert into public.events(id,code,name_en) values ('3e000000-0000-0000-0000-000000000001','DIR','Dir');
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values ('4e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001','T01','One','falcon','#123456');
insert into public.games(id,event_id,code,name_en) values ('5e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001','G01','Game');
insert into public.event_roles(event_id,member_id,role,team_id) values
('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000001','GUIDE','4e000000-0000-0000-0000-000000000001'),
('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000002','REFEREE',null);
insert into public.referee_games(event_id,member_id,game_id) values ('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000002','5e000000-0000-0000-0000-000000000001');

set local role anon;
select throws_ok($$select public.get_staff_directory('3e000000-0000-0000-0000-000000000001')$$,'42501',null,'visitors cannot read staff phones');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000001',true);
select is(public.get_staff_directory('3e000000-0000-0000-0000-000000000001')->'game_referees'->0->>'phone','+201000000102','a guide sees the referee phone of every game');
select is(public.get_staff_directory('3e000000-0000-0000-0000-000000000001')->'team_guides'->0->>'team_id','4e000000-0000-0000-0000-000000000001','guides are listed per team');
select throws_ok($$select public.get_staff_directory('3e000000-0000-0000-0000-000000000999')$$,'P0001','NOT_FOUND','unknown event');
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.get_staff_directory('3e000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','inactive members cannot read the directory');
reset role;

select * from finish();
rollback;
