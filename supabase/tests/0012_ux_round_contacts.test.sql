begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- UX U3 (D041–D043): ending rounds with late results, backdated starts, late first
-- results by referees, role-scoped contacts and the scoring-mode aware breakdown.
-- Members: 1 owner, 2 admin, 3 referee (G01), 4 referee (G02), 5 guide (T01), 6 outsider.
insert into auth.users(id) select ('1a000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,system_role,is_active)
select ('2a000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('1a000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'ux_member_'||n,'+2010000000'||lpad(n::text,2,'0'),'UX Member '||n,case when n=1 then 'OWNER' else 'MEMBER' end,true
from generate_series(1,6) n;
insert into public.events(id,code,name_en,points_win,points_draw,points_loss) values
('3a000000-0000-0000-0000-000000000001','UX-POINTS','UX Points',3,1,0);
insert into public.events(id,code,name_en,scoring_mode,initial_lives,points_win,points_draw,points_loss) values
('3a000000-0000-0000-0000-000000000002','UX-LIVES','UX Lives','LIVES',2,0,0,-1);
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex)
select ('4a000000-0000-0000-0000-'||lpad((e*10+n)::text,12,'0'))::uuid,('3a000000-0000-0000-0000-00000000000'||e)::uuid,'T0'||n,'Team '||n,'falcon','#123456'
from generate_series(1,2) e cross join generate_series(1,4) n;
insert into public.games(id,event_id,code,name_en)
select ('5a000000-0000-0000-0000-'||lpad((e*10+n)::text,12,'0'))::uuid,('3a000000-0000-0000-0000-00000000000'||e)::uuid,'G0'||n,'Game '||n
from generate_series(1,2) e cross join generate_series(1,2) n;
insert into public.rounds(id,event_id,number,duration_min)
select ('6a000000-0000-0000-0000-'||lpad((e*10+n)::text,12,'0'))::uuid,('3a000000-0000-0000-0000-00000000000'||e)::uuid,n,15
from generate_series(1,2) e cross join generate_series(1,3) n;
-- Each round: G01 T01–T02, G02 T03–T04 (round r, event e).
insert into public.matches(id,event_id,round_id,game_id)
select ('7a000000-0000-0000-0000-'||lpad((e*100+r*10+g)::text,12,'0'))::uuid,('3a000000-0000-0000-0000-00000000000'||e)::uuid,
  ('6a000000-0000-0000-0000-'||lpad((e*10+r)::text,12,'0'))::uuid,('5a000000-0000-0000-0000-'||lpad((e*10+g)::text,12,'0'))::uuid
from generate_series(1,2) e cross join generate_series(1,3) r cross join generate_series(1,2) g;
insert into public.match_participants(match_id,round_id,team_id,side)
select ('7a000000-0000-0000-0000-'||lpad((e*100+r*10+g)::text,12,'0'))::uuid,('6a000000-0000-0000-0000-'||lpad((e*10+r)::text,12,'0'))::uuid,
  ('4a000000-0000-0000-0000-'||lpad((e*10+(g-1)*2+s)::text,12,'0'))::uuid,case s when 1 then 'A' else 'B' end
from generate_series(1,2) e cross join generate_series(1,3) r cross join generate_series(1,2) g cross join generate_series(1,2) s;
insert into public.event_roles(event_id,member_id,role,team_id) values
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','EVENT_ADMIN',null),
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000003','REFEREE',null),
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000004','REFEREE',null),
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000005','GUIDE','4a000000-0000-0000-0000-000000000011'),
('3a000000-0000-0000-0000-000000000002','2a000000-0000-0000-0000-000000000002','EVENT_ADMIN',null);
insert into public.referee_games values
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000003','5a000000-0000-0000-0000-000000000011'),
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000004','5a000000-0000-0000-0000-000000000012');
create temp table ux_payload as select
  jsonb_build_array(jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000011','outcome','WIN'),
    jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000012','outcome','LOSS')) as g1_win,
  jsonb_build_array(jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000011','outcome','LOSS'),
    jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000012','outcome','WIN')) as g1_loss;
grant select on ux_payload to authenticated;

set local role authenticated;
-- Backdated start (D042).
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.start_round(gen_random_uuid(),'6a000000-0000-0000-0000-000000000011',181)$$,'P0001','INVALID_START_OFFSET','start offset above 180 minutes is rejected');
select throws_ok($$select public.start_round(gen_random_uuid(),'6a000000-0000-0000-0000-000000000011',-1)$$,'P0001','INVALID_START_OFFSET','negative start offset is rejected');
select is(public.start_round('9a000000-0000-0000-0000-000000000001','6a000000-0000-0000-0000-000000000011',30)->>'status','ACTIVE','admin starts a round 30 minutes ago');
select is(public.start_round('9a000000-0000-0000-0000-000000000001','6a000000-0000-0000-0000-000000000011',30)->>'status','ACTIVE','backdated start replays once');
reset role;
select ok((select started_at between now()-interval '30 minutes 5 seconds' and now()-interval '29 minutes 55 seconds' from public.rounds where id='6a000000-0000-0000-0000-000000000011'),'started_at is moved back by the offset');
select is((select count(*)::int from public.audit_log where entity_id='6a000000-0000-0000-0000-000000000011' and action='ROUND_STARTED' and (after->>'started_minutes_ago')::int=30),1,'audit records the offset once');
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.start_round(gen_random_uuid(),'6a000000-0000-0000-0000-000000000012',0)$$,'P0001','FORBIDDEN','referees cannot start rounds with an offset');

-- Referee board buckets and guide contacts (U3 B4, D043).
select is((select count(*)::int from jsonb_array_elements(public.get_referee_board('3a000000-0000-0000-0000-000000000001')->'matches') x where x->>'bucket'='current' and (x->>'editable')::boolean),1,'referee sees one editable current match');
select is((select count(*)::int from jsonb_array_elements(public.get_referee_board('3a000000-0000-0000-0000-000000000001')->'matches') x where x->>'bucket'='upcoming' and not (x->>'editable')::boolean),2,'referee sees read-only upcoming matches of their game');
select is(public.get_referee_board('3a000000-0000-0000-0000-000000000001')->'team_guides'->0->>'phone','+201000000005','referee sees the phone of a guide at their station');
select is(jsonb_array_length(public.get_referee_board('3a000000-0000-0000-0000-000000000001')->'team_guides'),1,'referee sees only guides of teams at their station');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000004',true);
select is(jsonb_array_length(public.get_referee_board('3a000000-0000-0000-0000-000000000001')->'team_guides'),0,'referee of another game sees no unrelated guides');

-- Ending a round keeps late results (D041).
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000003',true);
select is(public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000111',(select g1_win from ux_payload))->>'status','COMPLETED','referee enters G01 in the active round');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(public.close_round('9a000000-0000-0000-0000-000000000002','6a000000-0000-0000-0000-000000000011')->'late_match_ids'),1,'ending a round with a pending match succeeds and lists it as late');
select is(public.close_round('9a000000-0000-0000-0000-000000000002','6a000000-0000-0000-0000-000000000011')->>'status','CLOSED','end round replays once');
reset role;
select is((select status from public.matches where id='7a000000-0000-0000-0000-000000000112'),'SCHEDULED','the pending match stays scheduled');
select ok(not exists(select 1 from public.match_participants where match_id='7a000000-0000-0000-0000-000000000112' and outcome<>'PENDING'),'nothing is forfeited automatically');
select is((select count(*)::int from public.matches where event_id='3a000000-0000-0000-0000-000000000001' and status='VOID'),0,'nothing is voided automatically');
select ok((select after->'late_match_ids' @> '["7a000000-0000-0000-0000-000000000112"]' from public.audit_log where entity_id='6a000000-0000-0000-0000-000000000011' and action='ROUND_CLOSED'),'audit records late matches');
set local role anon;
select is((select (x->>'late_count')::int from jsonb_array_elements(public.get_bootstrap('3a000000-0000-0000-0000-000000000001')->'rounds') x where x->>'id'='6a000000-0000-0000-0000-000000000011'),1,'public round data counts late results');
select ok((public.get_bootstrap('3a000000-0000-0000-0000-000000000001'))::text !~ '"phone"','public bootstrap carries no phone numbers');
reset role;
set local role authenticated;

-- Late first result by the assigned referee only (D041).
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000003',true);
select is((select x->>'bucket' from jsonb_array_elements(public.get_referee_board('3a000000-0000-0000-0000-000000000001')->'matches') x where x->>'id'='7a000000-0000-0000-0000-000000000111'),'done','completed matches of an ended round stay as history (D050)');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000112','[]')$$,'P0001','FORBIDDEN','referee of another game cannot enter a late result');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000111',(select g1_loss from ux_payload))$$,'P0001','ROUND_NOT_ACTIVE','referee cannot correct a result after the round ended');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3a000000-0000-0000-0000-000000000001','MATCH','7a000000-0000-0000-0000-000000000111','4a000000-0000-0000-0000-000000000011',1,'Late bonus')$$,'P0001','ROUND_NOT_ACTIVE','referee adjustments stay limited to active rounds');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000004',true);
select is((select x->>'bucket'||':'||(x->>'editable') from jsonb_array_elements(public.get_referee_board('3a000000-0000-0000-0000-000000000001')->'matches') x where x->>'id'='7a000000-0000-0000-0000-000000000112'),'late:true','assigned referee sees the late match as editable');
select is(public.submit_match_result('9a000000-0000-0000-0000-000000000003','7a000000-0000-0000-0000-000000000112',
  jsonb_build_array(jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000013','outcome','DRAW'),jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000014','outcome','DRAW')))->>'status','COMPLETED','assigned referee enters the first late result');
select is(public.submit_match_result('9a000000-0000-0000-0000-000000000003','7a000000-0000-0000-0000-000000000112',
  jsonb_build_array(jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000013','outcome','DRAW'),jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000014','outcome','DRAW')))->>'status','COMPLETED','late result replays once');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000112',
  jsonb_build_array(jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000013','outcome','WIN'),jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000014','outcome','LOSS')))$$,'P0001','ROUND_NOT_ACTIVE','a second late submission is a correction and is refused');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select is(public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000111',(select g1_loss from ux_payload))->>'status','COMPLETED','admin may still correct after the round ended');
select is(public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000111',(select g1_win from ux_payload))->>'status','COMPLETED','admin restores the result');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000112','[]')$$,'P0001','FORBIDDEN','outsider cannot enter late results');
reset role;
set local role anon;
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000112','[]')$$,'42501',null,'anonymous cannot enter late results');
reset role;
set local role authenticated;

-- Next round cannot be backdated into the ended round (D042).
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.start_round(gen_random_uuid(),'6a000000-0000-0000-0000-000000000012',5)$$,'P0001','START_BEFORE_PREVIOUS_ROUND_END','a start may not precede the previous round end');
select is(public.start_round(gen_random_uuid(),'6a000000-0000-0000-0000-000000000012')->>'status','ACTIVE','the two-argument start still works');

-- Contacts (D043).
select ok(jsonb_array_length(public.get_live_event('3a000000-0000-0000-0000-000000000001')->'game_referee_contacts')=2
  and (public.get_live_event('3a000000-0000-0000-0000-000000000001')->'game_referee_contacts'->0 ? 'phone'),'admins see referee phones per game');
select is((select x->>'phone' from jsonb_array_elements(public.get_live_event('3a000000-0000-0000-0000-000000000001')->'team_guides') x),'+201000000005','admins see guide phones');
select ok((public.get_live_event('3a000000-0000-0000-0000-000000000001')->'games'->0->'referees'->0) - 'name_en' - 'name_ar' = '{}'::jsonb,'public referee names stay names only (D036)');
select is(public.get_event_contacts('3a000000-0000-0000-0000-000000000001')->0->>'phone','+201000000002','admin reads event administrator contacts');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000005',true);
select is(public.get_event_contacts('3a000000-0000-0000-0000-000000000001')->0->>'name_en','UX Member 2','guide reads event administrator contacts');
select throws_ok($$select public.get_live_event('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','guide cannot read referee phones');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.get_event_contacts('3a000000-0000-0000-0000-000000000001')),1,'referee reads event administrator contacts');
select throws_ok($$select public.get_live_event('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee cannot read all staff phones');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.get_event_contacts('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','members without a role in the event cannot read contacts');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.get_event_contacts('3a000000-0000-0000-0000-000000000001')$$,'owners read contacts');
reset role;
set local role anon;
select throws_ok($$select public.get_event_contacts('3a000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot read contacts');
reset role;

-- Breakdown reconciles with standings in POINTS mode (A7).
insert into public.adjustments(event_id,scope,team_id,points,reason,given_by) values
('3a000000-0000-0000-0000-000000000001','EVENT','4a000000-0000-0000-0000-000000000011',2,'Spirit','2a000000-0000-0000-0000-000000000002');
set local role anon;
select ok(public.get_team_view('3a000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'scoring_mode'='POINTS','team view carries the scoring mode');
select is((select sum((x->>'points')::int) from jsonb_array_elements(public.get_team_view('3a000000-0000-0000-0000-000000000001','T01')->'matches') x)::bigint,
  (public.get_team_view('3a000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'match_points')::bigint,'per-match points add up to match points');
reset role;
select is((public.get_team_view('3a000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::bigint,
  (select (x->>'total')::bigint from jsonb_array_elements(public.phase6_standings('3a000000-0000-0000-0000-000000000001')) x where x->'team'->>'code'='T01'),'breakdown total equals the standings total');
select is((public.get_team_view('3a000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::int,5,'win (3) plus bonus (2) is 5');
select is((public.get_team_view('3a000000-0000-0000-0000-000000000001','T03')->'breakdown'->>'total')::int,1,'late draw now counts (1)');

-- Breakdown reconciles in LIVES mode, including the floor at zero (D038).
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.start_round(gen_random_uuid(),'6a000000-0000-0000-0000-000000000021')$$,'lives event round starts');
select lives_ok($$select public.submit_match_result(gen_random_uuid(),'7a000000-0000-0000-0000-000000000211',jsonb_build_array(
  jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000021','outcome','LOSS'),jsonb_build_object('team_id','4a000000-0000-0000-0000-000000000022','outcome','WIN')))$$,'lives result entered');
select is(jsonb_array_length(public.close_round(gen_random_uuid(),'6a000000-0000-0000-0000-000000000021')->'late_match_ids'),1,'lives round ends with one late match');
reset role;
insert into public.adjustments(event_id,scope,team_id,points,reason,given_by) values
('3a000000-0000-0000-0000-000000000002','EVENT','4a000000-0000-0000-0000-000000000021',-5,'Penalty','2a000000-0000-0000-0000-000000000002');
select is((select (x->>'lives_delta')::int from jsonb_array_elements(public.get_team_view('3a000000-0000-0000-0000-000000000002','T01')->'matches') x where x->>'id'='7a000000-0000-0000-0000-000000000211'),-1,'a loss costs one life');
select is((public.get_team_view('3a000000-0000-0000-0000-000000000002','T01')->'breakdown'->>'lives_change')::int,-1,'the hearts change from matches is reported');
select is((public.get_team_view('3a000000-0000-0000-0000-000000000002','T01')->'breakdown'->>'total')::int,-4,'hearts may go below zero (D053)');
select is((public.get_team_view('3a000000-0000-0000-0000-000000000002','T01')->'breakdown'->>'total')::bigint,
  (select (x->>'total')::bigint from jsonb_array_elements(public.phase6_standings('3a000000-0000-0000-0000-000000000002')) x where x->'team'->>'code'='T01'),'lives breakdown equals the standings total');
select is((public.get_team_view('3a000000-0000-0000-0000-000000000002','T03')->'breakdown'->>'total')::int,2,'a late match costs no life until entered');
select ok(not (public.get_team_view('3a000000-0000-0000-0000-000000000002','T03')->'matches'->0 ? 'points'),'lives events report lives, not points');

-- Backdated start counts as "a round started" for the team and scoring locks (D035/D038).
select ok((select started_at is not null from public.rounds where id='6a000000-0000-0000-0000-000000000011'),'backdated round counts as started for the locks');
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'3a000000-0000-0000-0000-000000000001','{"scoring_mode":"LIVES","initial_lives":3}')$$,'P0001','SCORING_LOCKED','scoring mode stays locked after a backdated start');
reset role;

select * from finish();
rollback;
