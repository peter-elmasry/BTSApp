begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- D053: hearts mode with custom Win/Draw/Loss gains, 1–9999 start, no floor.
insert into auth.users(id) values ('1c000000-0000-0000-0000-000000000001');
insert into public.members(id,auth_user_id,username,full_name_en,system_role) values
('2c000000-0000-0000-0000-000000000001','1c000000-0000-0000-0000-000000000001','hearts_owner','Hearts Owner','OWNER');
insert into public.events(id,code,name_en) values ('3c000000-0000-0000-0000-000000000001','HEARTS','Hearts');
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex)
select ('4c000000-0000-0000-0000-00000000000'||n)::uuid,'3c000000-0000-0000-0000-000000000001','T0'||n,'Team '||n,'falcon','#123456' from generate_series(1,3) n;
insert into public.games(id,event_id,code,name_en) values ('5c000000-0000-0000-0000-000000000001','3c000000-0000-0000-0000-000000000001','G01','Game');
insert into public.rounds(id,event_id,number,duration_min) values ('6c000000-0000-0000-0000-000000000001','3c000000-0000-0000-0000-000000000001',1,15),('6c000000-0000-0000-0000-000000000002','3c000000-0000-0000-0000-000000000001',2,15);

set local role authenticated;
select set_config('request.jwt.claim.sub','1c000000-0000-0000-0000-000000000001',true);
select is(public.upsert_event_settings(gen_random_uuid(),'3c000000-0000-0000-0000-000000000001','{"scoring_mode":"LIVES","initial_lives":100}')->'settings'->>'points_loss','-1','switching to hearts without gains starts at Loss -1');
select is(public.upsert_event_settings(gen_random_uuid(),'3c000000-0000-0000-0000-000000000001','{"initial_lives":9999}')->'settings'->>'initial_lives','9999','up to 9999 starting hearts');
select is(public.upsert_event_settings(gen_random_uuid(),'3c000000-0000-0000-0000-000000000001','{"initial_lives":100,"points_win":0,"points_draw":-5,"points_loss":-10}')->'settings'->>'points_draw','-5','negative gains are accepted');
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'3c000000-0000-0000-0000-000000000001','{"points_loss":-1000000}')$$,'P0001','INVALID_SETTINGS','gains stay within six digits');
reset role;

insert into public.matches(id,event_id,round_id,game_id,status) values
('7c000000-0000-0000-0000-000000000001','3c000000-0000-0000-0000-000000000001','6c000000-0000-0000-0000-000000000001','5c000000-0000-0000-0000-000000000001','COMPLETED'),
('7c000000-0000-0000-0000-000000000002','3c000000-0000-0000-0000-000000000001','6c000000-0000-0000-0000-000000000002','5c000000-0000-0000-0000-000000000001','COMPLETED');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values
('7c000000-0000-0000-0000-000000000001','6c000000-0000-0000-0000-000000000001','4c000000-0000-0000-0000-000000000001','A','WIN'),
('7c000000-0000-0000-0000-000000000001','6c000000-0000-0000-0000-000000000001','4c000000-0000-0000-0000-000000000002','B','LOSS'),
('7c000000-0000-0000-0000-000000000002','6c000000-0000-0000-0000-000000000002','4c000000-0000-0000-0000-000000000002','A','DRAW'),
('7c000000-0000-0000-0000-000000000002','6c000000-0000-0000-0000-000000000002','4c000000-0000-0000-0000-000000000003','B','DRAW');

create temp table h_rows as select value as r from jsonb_array_elements(public.phase6_standings('3c000000-0000-0000-0000-000000000001'));
select is((select r->>'total' from h_rows where r->'team'->>'code'='T01'),'100','win with gain 0 keeps 100 hearts');
select is((select r->>'total' from h_rows where r->'team'->>'code'='T02'),'85','loss -10 and draw -5 leave 85');
select is((select r->>'total' from h_rows where r->'team'->>'code'='T03'),'95','draw -5 leaves 95');
select is((select (x->>'lives_delta')::int from jsonb_array_elements(public.get_team_view('3c000000-0000-0000-0000-000000000001','T02')->'matches') x where x->>'id'='7c000000-0000-0000-0000-000000000001'),-10,'team view shows the hearts change per match');
select is((public.get_team_view('3c000000-0000-0000-0000-000000000001','T02')->'breakdown'->>'lives_change')::int,-15,'breakdown sums the match changes');

update public.events set initial_lives=10 where id='3c000000-0000-0000-0000-000000000001';
select is((select (x->>'total')::int from jsonb_array_elements(public.phase6_standings('3c000000-0000-0000-0000-000000000001')) x where x->'team'->>'code'='T02'),-5,'hearts may go below zero');

select * from finish();
rollback;
