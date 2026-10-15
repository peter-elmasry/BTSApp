begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
create temp table audio_signals(payload jsonb,event text,topic text,is_private boolean);
create function pg_temp.capture_audio(jsonb,text,text,boolean) returns void language sql
as $$ insert into pg_temp.audio_signals values($1,$2,$3,$4) $$;
do $spy$ begin
  execute replace(pg_get_functiondef('public.record_round_audio()'::regprocedure),'realtime.send(','pg_temp.capture_audio(');
end $spy$;
insert into auth.users(id) select ('10000028-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role,is_active)
select ('20000028-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
('10000028-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'audio_test_'||n,'Audio Test '||n,
case when n=1 then 'OWNER' else 'MEMBER' end,true from generate_series(1,3) n;
insert into public.events(id,code,name_en,scoring_mode,initial_lives) values
('30000028-0000-0000-0000-000000000001','AUD-ONE','Audio','LIVES',3),
('30000028-0000-0000-0000-000000000002','AUD-TWO','Other','POINTS',null);
insert into public.event_roles(event_id,member_id,role) values
('30000028-0000-0000-0000-000000000001','20000028-0000-0000-0000-000000000002','EVENT_ADMIN'),
('30000028-0000-0000-0000-000000000001','20000028-0000-0000-0000-000000000003','REFEREE');
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
('40000028-0000-0000-0000-000000000001','30000028-0000-0000-0000-000000000001','T01','One','falcon','#123456'),
('40000028-0000-0000-0000-000000000002','30000028-0000-0000-0000-000000000001','T02','Two','lion','#234567');
insert into public.games(id,event_id,code,name_en) values('50000028-0000-0000-0000-000000000001','30000028-0000-0000-0000-000000000001','G01','Game');
insert into public.rounds(id,event_id,number,type,duration_min) values
('60000028-0000-0000-0000-000000000001','30000028-0000-0000-0000-000000000001',1,'REGULAR',10),
('60000028-0000-0000-0000-000000000002','30000028-0000-0000-0000-000000000001',2,'REGULAR',10);
insert into public.matches(id,event_id,round_id,game_id) values('70000028-0000-0000-0000-000000000001','30000028-0000-0000-0000-000000000001','60000028-0000-0000-0000-000000000001','50000028-0000-0000-0000-000000000001');
insert into public.match_participants(match_id,round_id,team_id,side) values
('70000028-0000-0000-0000-000000000001','60000028-0000-0000-0000-000000000001','40000028-0000-0000-0000-000000000001','A'),
('70000028-0000-0000-0000-000000000001','60000028-0000-0000-0000-000000000001','40000028-0000-0000-0000-000000000002','B');
select is((select count(*)::int from public.round_audio_cues where event_id='30000028-0000-0000-0000-000000000001'),0,'migration/initial setup creates no historical cues');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000028-0000-0000-0000-000000000002',true);
select lives_ok($$select public.start_round('90000028-0000-0000-0000-000000000001','60000028-0000-0000-0000-000000000001',5)$$,'admin backdates start');
select lives_ok($$select public.start_round('90000028-0000-0000-0000-000000000001','60000028-0000-0000-0000-000000000001',5)$$,'start replay succeeds');
select lives_ok($$select public.extend_round('90000028-0000-0000-0000-000000000002','60000028-0000-0000-0000-000000000001',2)$$,'extension succeeds without new cue');
reset role;
select is((select count(*)::int from public.round_audio_cues where event_id='30000028-0000-0000-0000-000000000001'),1,'start retry and extension do not duplicate cue');
select ok((select occurred_at>clock_timestamp()-interval '10 seconds' from public.round_audio_cues where event_id='30000028-0000-0000-0000-000000000001'),'backdated start cues at action time');
set local role authenticated;
select lives_ok($$select public.submit_match_result('90000028-0000-0000-0000-000000000003','70000028-0000-0000-0000-000000000001','[{"team_id":"40000028-0000-0000-0000-000000000001","outcome":"WIN"},{"team_id":"40000028-0000-0000-0000-000000000002","outcome":"LOSS"}]')$$,'confirmed result saved');
select lives_ok($$select public.close_round('90000028-0000-0000-0000-000000000004','60000028-0000-0000-0000-000000000001')$$,'close emits end');
select lives_ok($$select public.reopen_round('90000028-0000-0000-0000-000000000005','60000028-0000-0000-0000-000000000001','Review result')$$,'reopen succeeds without start cue');
reset role;
select is((select array_agg(cue order by sequence) from public.round_audio_cues where event_id='30000028-0000-0000-0000-000000000001'),array['round-start','round-end'],'only committed start and close cue');
select ok(not exists(select 1 from audio_signals s cross join lateral jsonb_object_keys(s.payload) k where k not in ('type','roundId','cueId','cue','occurredAt')),'public cues contain only allowlisted identifiers/timestamp');
select ok(not exists(select 1 from audio_signals where payload::text ~ '"(outcome|team_id|participants|points|reason)"[[:space:]]*:'),'public cue stream contains no outcomes');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is(jsonb_array_length(public.get_recent_round_cues('30000028-0000-0000-0000-000000000001')->'cues'),2,'anonymous viewer reads fresh occurrences');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')->'results'->0->>'outcome','WIN','followed winner receives win');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')->'results'->0->'audible','true'::jsonb,'enabled outcome has an action-time occurrence');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T02')->'results'->0->>'outcome','LOSS','followed loser receives loss');
select is(jsonb_array_length(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')->'results'),1,'own-team read contains one own outcome only');
select ok(not (public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')::text ~ '"(participants|team_id|result_entered_by|phone|username)"[[:space:]]*:'),'own-team audio read omits opponent/staff data');
select throws_ok($$select * from public.round_audio_cues$$,'42501',null,'anonymous cannot bypass occurrence reader');
select throws_ok($$select public.set_audio_config(gen_random_uuid(),'30000028-0000-0000-0000-000000000001','{}')$$,'42501',null,'anonymous cannot configure');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000028-0000-0000-0000-000000000002',true);
select throws_ok($$select public.set_audio_config(gen_random_uuid(),'30000028-0000-0000-0000-000000000001','{"enabled":"true"}')$$,'P0001','INVALID_AUDIO_CONFIG','non-boolean/incomplete config rejected');
select throws_ok($$select public.set_audio_config(gen_random_uuid(),'30000028-0000-0000-0000-000000000002','{}')$$,'P0001','FORBIDDEN','cross-event admin denied');
select lives_ok($$select public.set_audio_config('90000028-0000-0000-0000-000000000006','30000028-0000-0000-0000-000000000001','{"enabled":false,"round_start":true,"round_end":true,"match_win":true,"match_loss":true,"match_draw":true}')$$,'admin disables event audio');
select lives_ok($$select public.submit_match_result('90000028-0000-0000-0000-000000000011','70000028-0000-0000-0000-000000000001','[{"team_id":"40000028-0000-0000-0000-000000000001","outcome":"DRAW"},{"team_id":"40000028-0000-0000-0000-000000000002","outcome":"DRAW"}]')$$,'disabled sound never blocks a draw correction');
select lives_ok($$select public.close_round('90000028-0000-0000-0000-000000000007','60000028-0000-0000-0000-000000000001')$$,'disabled sound never blocks close');
select is(jsonb_array_length(public.get_recent_round_cues('30000028-0000-0000-0000-000000000001')->'cues'),0,'master switch hides old fresh cues');
reset role;
select is((select count(*)::int from public.round_audio_cues where event_id='30000028-0000-0000-0000-000000000001'),2,'disabled close records no cue');
update public.round_audio_cues set occurred_at=clock_timestamp()-interval '1 minute' where event_id='30000028-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.set_audio_config('90000028-0000-0000-0000-000000000008','30000028-0000-0000-0000-000000000001','{"enabled":true,"round_start":true,"round_end":true,"match_win":true,"match_loss":true,"match_draw":true}')$$,'admin re-enables sound');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')->'results'->0->'audible','false'::jsonb,'re-enabling cannot backlog a result recorded while muted');
select is(jsonb_array_length(public.get_recent_round_cues('30000028-0000-0000-0000-000000000001')->'cues'),0,'stale occurrences never enter fallback');
select lives_ok($$select public.start_round('90000028-0000-0000-0000-000000000009','60000028-0000-0000-0000-000000000002')$$,'next round starts');
select is(public.get_recent_round_cues('30000028-0000-0000-0000-000000000001')->'cues'->0->>'cue','round-start','new occurrence remains available');
select set_config('request.jwt.claim.sub','10000028-0000-0000-0000-000000000003',true);
select throws_ok($$select public.set_audio_config(gen_random_uuid(),'30000028-0000-0000-0000-000000000001','{}')$$,'P0001','FORBIDDEN','referee cannot configure');
select set_config('request.jwt.claim.sub','10000028-0000-0000-0000-000000000001',true);
select lives_ok($$select public.set_audio_config('90000028-0000-0000-0000-000000000010','30000028-0000-0000-0000-000000000002','{"enabled":true,"round_start":false,"round_end":true,"match_win":true,"match_loss":true,"match_draw":true}')$$,'owner configures other event');
reset role;
insert into public.rounds(id,event_id,number,type,duration_min) values('60000028-0000-0000-0000-000000000000','30000028-0000-0000-0000-000000000001',0,'OPENING',10);
insert into public.matches(id,event_id,round_id,game_id) values('70000028-0000-0000-0000-000000000002','30000028-0000-0000-0000-000000000001','60000028-0000-0000-0000-000000000000','50000028-0000-0000-0000-000000000001');
insert into public.match_participants(match_id,round_id,team_id) values
('70000028-0000-0000-0000-000000000002','60000028-0000-0000-0000-000000000000','40000028-0000-0000-0000-000000000001'),
('70000028-0000-0000-0000-000000000002','60000028-0000-0000-0000-000000000000','40000028-0000-0000-0000-000000000002');
set local role authenticated;
select lives_ok($$select public.close_round('90000028-0000-0000-0000-000000000012','60000028-0000-0000-0000-000000000002')$$,'owner closes next round');
select lives_ok($$select public.start_round('90000028-0000-0000-0000-000000000013','60000028-0000-0000-0000-000000000000')$$,'opening round starts');
select lives_ok($$select public.submit_match_result('90000028-0000-0000-0000-000000000014','70000028-0000-0000-0000-000000000002','[{"team_id":"40000028-0000-0000-0000-000000000001","outcome":"WIN"},{"team_id":"40000028-0000-0000-0000-000000000002","outcome":"WIN"}]')$$,'multiple opening winners are committed');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')->'results'->1->>'outcome','WIN','first opening winner receives its own win');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T02')->'results'->1->>'outcome','WIN','second opening winner receives its own win');
select lives_ok($$select public.reset_match_result('90000028-0000-0000-0000-000000000015','70000028-0000-0000-0000-000000000002')$$,'reset succeeds');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')->'results'->1->>'outcome','PENDING','reset cannot celebrate');
select lives_ok($$select public.void_match('90000028-0000-0000-0000-000000000016','70000028-0000-0000-0000-000000000002','Cancelled')$$,'void succeeds');
select is(public.get_team_audio_results('30000028-0000-0000-0000-000000000001','T01')->'results'->1->'audible','false'::jsonb,'void remains inaudible');
reset role;
select * from finish();
rollback;
