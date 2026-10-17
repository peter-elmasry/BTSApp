begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id) values ('1e000000-0000-0000-0000-000000000001'),('1e000000-0000-0000-0000-000000000002');
insert into public.members(id,auth_user_id,username,full_name_en,system_role) values
('2e000000-0000-0000-0000-000000000001','1e000000-0000-0000-0000-000000000001','neutral_owner','Neutral Owner','OWNER'),
('2e000000-0000-0000-0000-000000000002','1e000000-0000-0000-0000-000000000002','neutral_ref','Neutral Referee','MEMBER');
insert into public.events(id,code,name_en,leaderboard_public) values ('3e000000-0000-0000-0000-000000000001','NEUTRAL','Neutral event',true);
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex)
select ('4e000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'3e000000-0000-0000-0000-000000000001','T0'||n,'Team '||n,'falcon','#123456' from generate_series(1,6) n;
insert into public.games(id,event_id,code,name_en) values ('5e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001','G01','Neutral candidate'),('5e000000-0000-0000-0000-000000000002','3e000000-0000-0000-0000-000000000001','G02','Normal game');
insert into public.rounds(id,event_id,number,type,status,duration_min,started_at) values
('6e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001',1,'REGULAR','CLOSED',15,now()-interval '1 hour'),
('6e000000-0000-0000-0000-000000000002','3e000000-0000-0000-0000-000000000001',2,'REGULAR','ACTIVE',15,now()),
('6e000000-0000-0000-0000-000000000003','3e000000-0000-0000-0000-000000000001',3,'REGULAR','DRAFT',15,null),
('6e000000-0000-0000-0000-000000000004','3e000000-0000-0000-0000-000000000001',4,'REGULAR','CLOSED',15,now()-interval '1 hour'),
('6e000000-0000-0000-0000-000000000005','3e000000-0000-0000-0000-000000000001',0,'OPENING','DRAFT',15,null);
insert into public.matches(id,event_id,round_id,game_id,status,result_entered_by,result_entered_at) values ('7e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001','COMPLETED','2e000000-0000-0000-0000-000000000002',now());
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000001','4e000000-0000-0000-0000-000000000001','A','LOSS');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000001','4e000000-0000-0000-0000-000000000002','B','WIN');
insert into public.matches(id,event_id,round_id,game_id,status,result_entered_by,result_entered_at) values ('7e000000-0000-0000-0000-000000000002','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000002','5e000000-0000-0000-0000-000000000001','SCHEDULED',null,null);
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000002','6e000000-0000-0000-0000-000000000002','4e000000-0000-0000-0000-000000000001','A','PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000002','6e000000-0000-0000-0000-000000000002','4e000000-0000-0000-0000-000000000002','B','PENDING');
insert into public.matches(id,event_id,round_id,game_id,status,result_entered_by,result_entered_at) values ('7e000000-0000-0000-0000-000000000003','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000003','5e000000-0000-0000-0000-000000000001','SCHEDULED',null,null);
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000003','6e000000-0000-0000-0000-000000000003','4e000000-0000-0000-0000-000000000001','A','PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000003','6e000000-0000-0000-0000-000000000003','4e000000-0000-0000-0000-000000000002','B','PENDING');
insert into public.matches(id,event_id,round_id,game_id,status,result_entered_by,result_entered_at) values ('7e000000-0000-0000-0000-000000000004','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000004','5e000000-0000-0000-0000-000000000001','VOID',null,null);
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000004','6e000000-0000-0000-0000-000000000004','4e000000-0000-0000-0000-000000000001','A','PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000004','6e000000-0000-0000-0000-000000000004','4e000000-0000-0000-0000-000000000002','B','PENDING');
insert into public.matches(id,event_id,round_id,game_id,status,result_entered_by,result_entered_at) values ('7e000000-0000-0000-0000-000000000005','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000005','5e000000-0000-0000-0000-000000000001','SCHEDULED',null,null);
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000005','6e000000-0000-0000-0000-000000000005','4e000000-0000-0000-0000-000000000001',null,'PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000005','6e000000-0000-0000-0000-000000000005','4e000000-0000-0000-0000-000000000002',null,'PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000005','6e000000-0000-0000-0000-000000000005','4e000000-0000-0000-0000-000000000003',null,'PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000005','6e000000-0000-0000-0000-000000000005','4e000000-0000-0000-0000-000000000004',null,'PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000005','6e000000-0000-0000-0000-000000000005','4e000000-0000-0000-0000-000000000005',null,'PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000005','6e000000-0000-0000-0000-000000000005','4e000000-0000-0000-0000-000000000006',null,'PENDING');
insert into public.matches(id,event_id,round_id,game_id,status) values ('7e000000-0000-0000-0000-000000000011','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000002','COMPLETED');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000011','6e000000-0000-0000-0000-000000000001','4e000000-0000-0000-0000-000000000003','A','DRAW');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000011','6e000000-0000-0000-0000-000000000001','4e000000-0000-0000-0000-000000000004','B','DRAW');
insert into public.matches(id,event_id,round_id,game_id,status) values ('7e000000-0000-0000-0000-000000000012','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000002','5e000000-0000-0000-0000-000000000002','SCHEDULED');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000012','6e000000-0000-0000-0000-000000000002','4e000000-0000-0000-0000-000000000003','A','PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000012','6e000000-0000-0000-0000-000000000002','4e000000-0000-0000-0000-000000000004','B','PENDING');
insert into public.matches(id,event_id,round_id,game_id,status) values ('7e000000-0000-0000-0000-000000000013','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000003','5e000000-0000-0000-0000-000000000002','SCHEDULED');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000013','6e000000-0000-0000-0000-000000000003','4e000000-0000-0000-0000-000000000003','A','PENDING');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values ('7e000000-0000-0000-0000-000000000013','6e000000-0000-0000-0000-000000000003','4e000000-0000-0000-0000-000000000004','B','PENDING');
insert into public.event_roles(event_id,member_id,role) values ('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000002','REFEREE');
insert into public.referee_games(event_id,member_id,game_id) values ('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000002','5e000000-0000-0000-0000-000000000001'),('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000002','5e000000-0000-0000-0000-000000000002');
insert into public.adjustments(event_id,scope,match_id,team_id,points,reason,given_by) values
('3e000000-0000-0000-0000-000000000001','EVENT',null,'4e000000-0000-0000-0000-000000000001',1,'Event bonus','2e000000-0000-0000-0000-000000000001'),
('3e000000-0000-0000-0000-000000000001','MATCH','7e000000-0000-0000-0000-000000000001','4e000000-0000-0000-0000-000000000001',2,'Match bonus','2e000000-0000-0000-0000-000000000001'),
('3e000000-0000-0000-0000-000000000001','MATCH','7e000000-0000-0000-0000-000000000004','4e000000-0000-0000-0000-000000000001',7,'Voided bonus','2e000000-0000-0000-0000-000000000001');
create temp table neutral_original_matches as select * from public.matches where event_id='3e000000-0000-0000-0000-000000000001';
create temp table neutral_original_participants as select mp.* from public.match_participants mp join public.matches m on m.id=mp.match_id where m.event_id='3e000000-0000-0000-0000-000000000001';
select ok(not has_table_privilege('anon','public.neutral_matches','SELECT'),'anonymous has no direct effective-match access');
select ok(not has_table_privilege('authenticated','public.neutral_participants','SELECT'),'staff have no direct effective-outcome access');
select ok(not has_function_privilege('anon','public.set_game_neutral(uuid,uuid,boolean,boolean,integer)','EXECUTE'),'anonymous cannot configure neutral games');
set local role authenticated;
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.set_game_neutral(gen_random_uuid(),'5e000000-0000-0000-0000-000000000001',true,false,4)$$,'P0001','FORBIDDEN','referee cannot enable neutral mode');
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000001',true);
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,3::numeric,'baseline includes original loss and existing bonuses only');
select throws_ok($$select public.set_game_neutral(gen_random_uuid(),'5e000000-0000-0000-0000-000000000001',true,false,3)$$,'P0001','NEUTRAL_GAME_CHANGED','stale impact count is rejected without changing scores');
select lives_ok($$select public.set_tiebreak(gen_random_uuid(),'3e000000-0000-0000-0000-000000000001',array['4e000000-0000-0000-0000-000000000003','4e000000-0000-0000-0000-000000000004']::uuid[])$$,'baseline tie can be manually ordered');
select is(public.set_game_neutral('9e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001',true,false,4)->>'is_neutral','true','admin enables neutral with reviewed impact');
reset role;
select is((select count(*) from public.teams where event_id='3e000000-0000-0000-0000-000000000001' and final_tiebreak_pos is not null),0::bigint,'neutral change invalidates manual ties');
set local role authenticated;
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,11::numeric,'past active future and opening matches immediately award wins; bonuses stay');
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T03')->'breakdown'->>'total')::numeric,3::numeric,'unrelated game results stay unchanged; opening neutral win applies');
select is(public.set_game_neutral('9e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001',true,false,4)->>'is_neutral','true','neutral-setting replay is idempotent');
select throws_ok($$select public.set_game_neutral(gen_random_uuid(),'5e000000-0000-0000-0000-000000000001',false,false,4)$$,'P0001','NEUTRAL_GAME_CHANGED','stale game state cannot silently undo another change');
select is((select count(*) from jsonb_array_elements(public.get_schedule('3e000000-0000-0000-0000-000000000001')) x where x->>'game_id'='5e000000-0000-0000-0000-000000000001' and x->>'status'='COMPLETED'),4::bigint,'schedule reports every non-void neutral match completed');
select is((select x->>'status' from jsonb_array_elements(public.get_schedule('3e000000-0000-0000-0000-000000000001')) x where x->>'id'='7e000000-0000-0000-0000-000000000004'),'VOID','voided neutral match stays void');
select is((select count(*) from jsonb_array_elements(public.get_pending_matches('6e000000-0000-0000-0000-000000000001')) x where x->>'game_id'='5e000000-0000-0000-0000-000000000001'),0::bigint,'neutral matches are never pending');
select is((public.get_match_entry('7e000000-0000-0000-0000-000000000003')->'matches'->0->'participants'->0->>'outcome'),'WIN','future match entry shows automatic winner');
select is((select (x->>'total')::numeric from jsonb_array_elements(public.get_export_data('3e000000-0000-0000-0000-000000000001')->'standings') x where x->'team'->>'code'='T01'),11::numeric,'export standings reconcile exactly');
select is((select x->'participants'->0->>'outcome' from jsonb_array_elements(public.get_export_data('3e000000-0000-0000-0000-000000000001')->'matches') x where x->>'id'='7e000000-0000-0000-0000-000000000003'),'WIN','export uses effective future wins');
select is((select count(*) from jsonb_array_elements(public.get_team_audio_results('3e000000-0000-0000-0000-000000000001','T01')->'results') x where (x->>'audible')::boolean),0::bigint,'retroactive neutral changes do not emit historical result sounds');
select throws_ok($$select public.reset_match_result(gen_random_uuid(),'7e000000-0000-0000-0000-000000000001')$$,'P0001','NEUTRAL_GAME','admin cannot reset stored results while neutral is enabled');
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7e000000-0000-0000-0000-000000000001','[{"team_id":"4e000000-0000-0000-0000-000000000001","outcome":"WIN"},{"team_id":"4e000000-0000-0000-0000-000000000002","outcome":"LOSS"}]')$$,'P0001','NEUTRAL_GAME','referee cannot submit a stale result for round 1');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7e000000-0000-0000-0000-000000000002','[{"team_id":"4e000000-0000-0000-0000-000000000001","outcome":"WIN"},{"team_id":"4e000000-0000-0000-0000-000000000002","outcome":"LOSS"}]')$$,'P0001','NEUTRAL_GAME','referee cannot submit a stale result for round 2');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'7e000000-0000-0000-0000-000000000003','[{"team_id":"4e000000-0000-0000-0000-000000000001","outcome":"WIN"},{"team_id":"4e000000-0000-0000-0000-000000000002","outcome":"LOSS"}]')$$,'P0001','NEUTRAL_GAME','referee cannot submit a stale result for round 3');
select is((select count(*) from jsonb_array_elements(public.get_referee_board('3e000000-0000-0000-0000-000000000001')->'matches') x where x->>'game_id'='5e000000-0000-0000-0000-000000000001' and (x->>'editable')::boolean),0::bigint,'referee board marks all neutral matches read-only');
select lives_ok($$select public.submit_match_result(gen_random_uuid(),'7e000000-0000-0000-0000-000000000012','[{"team_id":"4e000000-0000-0000-0000-000000000003","outcome":"WIN"},{"team_id":"4e000000-0000-0000-0000-000000000004","outcome":"LOSS"}]')$$,'normal active game still accepts referee results');
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.close_round(gen_random_uuid(),'6e000000-0000-0000-0000-000000000002')->'late_match_ids'),0,'closing a round excludes neutral matches from late results');
select lives_ok($$select public.upsert_game(gen_random_uuid(),'3e000000-0000-0000-0000-000000000001','{"id":"5e000000-0000-0000-0000-000000000001","code":"G01","name_en":"Renamed neutral game"}')$$,'legacy game edit preserves neutral flag');
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,11::numeric,'legacy game edit does not reset neutral scoring');
select lives_ok($$select public.upsert_event_settings(gen_random_uuid(),'3e000000-0000-0000-0000-000000000001','{"points_win":3}')$$,'normal scoring configuration still changes neutral win gains');
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,15::numeric,'each neutral win uses the current configured win gain');
reset role;
update public.events set scoring_mode='LIVES',initial_lives=10,points_win=0,points_loss=-1 where id='3e000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,13::numeric,'neutral hearts wins use zero gain without losses; bonuses remain');
select lives_ok($$select public.set_game_neutral(gen_random_uuid(),'5e000000-0000-0000-0000-000000000001',false,true,4)$$,'disabling neutral restores original stored scoring');
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,12::numeric,'original past loss returns in hearts mode');
select is((public.get_match_entry('7e000000-0000-0000-0000-000000000003')->'matches'->0->>'status'),'SCHEDULED','future matches return to pending after reversal');
select is(public.set_game_neutral('9e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001',true,false,4)->>'is_neutral','true','old operation replay returns its original receipt after reversal');
select is((public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,12::numeric,'old operation replay never re-enables neutral mode after reversal');
reset role;
select is((select count(*) from ((select * from public.matches where game_id='5e000000-0000-0000-0000-000000000001') except (select * from neutral_original_matches where game_id='5e000000-0000-0000-0000-000000000001')) d),0::bigint,'neutral toggles never rewrite stored match status timestamps or actors');
select is((select count(*) from ((select mp.* from public.match_participants mp join public.matches m on m.id=mp.match_id where m.game_id='5e000000-0000-0000-0000-000000000001') except (select p.* from neutral_original_participants p join neutral_original_matches m on m.id=p.match_id where m.game_id='5e000000-0000-0000-0000-000000000001')) d),0::bigint,'neutral toggles never rewrite original outcomes');
select is((select count(*) from public.matches where game_id='5e000000-0000-0000-0000-000000000001'),5::bigint,'neutral toggles do not delete matches');
select is((select count(*) from public.match_participants mp join public.matches m on m.id=mp.match_id where m.game_id='5e000000-0000-0000-0000-000000000001'),14::bigint,'neutral toggles do not delete participants');
-- New matches automatically inherit neutral scoring, without copying any results.
select public.set_game_neutral(gen_random_uuid(),'5e000000-0000-0000-0000-000000000001',true,false,4);
insert into public.rounds(id,event_id,number,duration_min) values ('6e000000-0000-0000-0000-000000000006','3e000000-0000-0000-0000-000000000001',6,15);
insert into public.matches(id,event_id,round_id,game_id) values ('7e000000-0000-0000-0000-000000000006','3e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000006','5e000000-0000-0000-0000-000000000001');
insert into public.match_participants(match_id,round_id,team_id,side) values
('7e000000-0000-0000-0000-000000000006','6e000000-0000-0000-0000-000000000006','4e000000-0000-0000-0000-000000000001','A'),
('7e000000-0000-0000-0000-000000000006','6e000000-0000-0000-0000-000000000006','4e000000-0000-0000-0000-000000000002','B');
select is((select (x->>'wins')::int from jsonb_array_elements(public.phase6_standings('3e000000-0000-0000-0000-000000000001')) x where x->'team'->>'code'='T01'),5,'new future match automatically counts as a neutral win');
select is((select status from public.matches where id='7e000000-0000-0000-0000-000000000006'),'SCHEDULED','new match keeps its real pending state');
select public.upsert_event_settings(gen_random_uuid(),'3e000000-0000-0000-0000-000000000001','{"leaderboard_public":false}');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_ok($$select public.get_standings('3e000000-0000-0000-0000-000000000001')$$,'P0001','LEADERBOARD_HIDDEN','neutral mode does not open the hidden leaderboard');
select is((select count(*) from jsonb_array_elements(public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'matches') m cross join lateral jsonb_array_elements(m->'participants') p where p->>'team_code'='T02' and p ? 'outcome'),0::bigint,'neutral opponents keep hidden outcomes private');
select is((select count(*) from jsonb_array_elements(public.get_team_view('3e000000-0000-0000-0000-000000000001','T01')->'matches') m cross join lateral jsonb_array_elements(m->'participants') p where p->>'team_code'='T01' and p->>'outcome'='WIN'),5::bigint,'own-team neutral wins remain visible');
reset role;
select * from finish();
rollback;
