begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

create temp table phase6_signals(payload jsonb,event text,topic text,is_private boolean);
create function pg_temp.phase6_capture(jsonb,text,text,boolean) returns void
language sql as $$ insert into pg_temp.phase6_signals values($1,$2,$3,$4) $$;
do $spy$ begin
  execute replace(pg_get_functiondef('public.emit(uuid,text,jsonb)'::regprocedure),'realtime.send(','pg_temp.phase6_capture(');
end $spy$;
-- Deterministic suite-only IDs; no privileged domain read helpers are exposed.
create function pg_temp.p6_id(p_kind int,p_n int) returns uuid language sql immutable
as $$ select (p_kind::text||'6000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid $$;
create function pg_temp.p6_row(p_code text) returns jsonb language sql stable
as $$ select x from jsonb_array_elements(public.get_standings(pg_temp.p6_id(3,1))) x where x->'team'->>'code'=p_code $$;
create function pg_temp.p6_denied(p_n int) returns setof text language plpgsql
as $$ begin
  perform set_config('request.jwt.claim.sub',pg_temp.p6_id(1,p_n)::text,true);
  return next throws_ok('select public.get_standings(pg_temp.p6_id(3,1))','P0001','LEADERBOARD_HIDDEN','hidden standings denied to member '||p_n);
  return next throws_ok('select public.get_export_data(pg_temp.p6_id(3,1))','P0001','FORBIDDEN','export denied to member '||p_n);
  return next throws_ok('select public.set_leaderboard_visibility(gen_random_uuid(),pg_temp.p6_id(3,1),true)','P0001','FORBIDDEN','visibility denied to member '||p_n);
  return next throws_ok('select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,2)])','P0001','FORBIDDEN','tie resolution denied to member '||p_n);
end $$;

insert into auth.users(id) select pg_temp.p6_id(1,n) from generate_series(1,7) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,full_name_ar,system_role,is_active)
select pg_temp.p6_id(2,n),pg_temp.p6_id(1,n),'phase6_private_'||n,'+20133333333'||n,'Phase Six '||n,'عضو '||n,
  case when n=1 then 'OWNER' else 'MEMBER' end,n<>6 from generate_series(1,7) n;
insert into public.events(id,code,name_en,name_ar,show_guide_phone) values
(pg_temp.p6_id(3,1),'P6-EVENT','Phase Six','المرحلة السادسة',true),(pg_temp.p6_id(3,2),'P6-OTHER','Other','أخرى',false);
insert into public.teams(id,event_id,code,name_en,name_ar,avatar_key,color_hex)
select pg_temp.p6_id(4,n),pg_temp.p6_id(3,1),'T0'||n,'Team '||n,'فريق '||n,'falcon','#123456' from generate_series(1,5) n;
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
(pg_temp.p6_id(4,99),pg_temp.p6_id(3,2),'OTHER','Other','falcon','#123456');
insert into public.games(id,event_id,code,name_en,name_ar) values
(pg_temp.p6_id(5,1),pg_temp.p6_id(3,1),'G01','Race','سباق'),(pg_temp.p6_id(5,2),pg_temp.p6_id(3,1),'G02','Puzzle','ألغاز');
insert into public.rounds(id,event_id,number,type,duration_min)
select pg_temp.p6_id(6,n),pg_temp.p6_id(3,1),n,case when n=0 then 'OPENING' else 'REGULAR' end,10 from generate_series(0,2) n;
insert into public.matches(id,event_id,round_id,game_id,status,result_entered_by,result_entered_at) values
(pg_temp.p6_id(7,0),pg_temp.p6_id(3,1),pg_temp.p6_id(6,0),pg_temp.p6_id(5,1),'COMPLETED',pg_temp.p6_id(2,3),now()-interval '20 minutes'),
(pg_temp.p6_id(7,1),pg_temp.p6_id(3,1),pg_temp.p6_id(6,1),pg_temp.p6_id(5,1),'COMPLETED',pg_temp.p6_id(2,3),now()-interval '10 minutes'),
(pg_temp.p6_id(7,2),pg_temp.p6_id(3,1),pg_temp.p6_id(6,1),pg_temp.p6_id(5,2),'COMPLETED',pg_temp.p6_id(2,2),now()),
(pg_temp.p6_id(7,3),pg_temp.p6_id(3,1),pg_temp.p6_id(6,2),pg_temp.p6_id(5,1),'SCHEDULED',null,null);
insert into public.match_participants(match_id,round_id,team_id,side,outcome)
select pg_temp.p6_id(7,0),pg_temp.p6_id(6,0),pg_temp.p6_id(4,n),null,
  (array['WIN','WIN','LOSS','FORFEIT','LOSS'])[n] from generate_series(1,5) n;
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values
(pg_temp.p6_id(7,1),pg_temp.p6_id(6,1),pg_temp.p6_id(4,1),'A','WIN'),
(pg_temp.p6_id(7,1),pg_temp.p6_id(6,1),pg_temp.p6_id(4,2),'B','LOSS'),
(pg_temp.p6_id(7,2),pg_temp.p6_id(6,1),pg_temp.p6_id(4,3),'A','DRAW'),
(pg_temp.p6_id(7,2),pg_temp.p6_id(6,1),pg_temp.p6_id(4,4),'B','DRAW'),
(pg_temp.p6_id(7,3),pg_temp.p6_id(6,2),pg_temp.p6_id(4,1),'A','PENDING'),
(pg_temp.p6_id(7,3),pg_temp.p6_id(6,2),pg_temp.p6_id(4,2),'B','PENDING');
insert into public.event_roles(event_id,member_id,role,team_id) values
(pg_temp.p6_id(3,1),pg_temp.p6_id(2,2),'EVENT_ADMIN',null),
(pg_temp.p6_id(3,1),pg_temp.p6_id(2,3),'REFEREE',null),
(pg_temp.p6_id(3,1),pg_temp.p6_id(2,4),'GUIDE',pg_temp.p6_id(4,1)),
(pg_temp.p6_id(3,1),pg_temp.p6_id(2,6),'EVENT_ADMIN',null);
insert into public.referee_games values(pg_temp.p6_id(3,1),pg_temp.p6_id(2,3),pg_temp.p6_id(5,1));
insert into public.adjustments(id,event_id,scope,match_id,team_id,points,reason,given_by,revoked_at,revoke_reason) values
(pg_temp.p6_id(8,1),pg_temp.p6_id(3,1),'EVENT',null,pg_temp.p6_id(4,1),1,'Event bonus',pg_temp.p6_id(2,2),null,null),
(pg_temp.p6_id(8,2),pg_temp.p6_id(3,1),'MATCH',pg_temp.p6_id(7,1),pg_temp.p6_id(4,1),2,'Match bonus',pg_temp.p6_id(2,3),null,null),
(pg_temp.p6_id(8,3),pg_temp.p6_id(3,1),'MATCH',pg_temp.p6_id(7,3),pg_temp.p6_id(4,2),3,'Pending match bonus',pg_temp.p6_id(2,2),null,null),
(pg_temp.p6_id(8,4),pg_temp.p6_id(3,1),'EVENT',null,pg_temp.p6_id(4,3),-5,'Event penalty',pg_temp.p6_id(2,2),null,null),
(pg_temp.p6_id(8,5),pg_temp.p6_id(3,1),'EVENT',null,pg_temp.p6_id(4,4),9,'Revoked bonus',pg_temp.p6_id(2,2),now(),'Correction');

-- Measure visibility notifications independently of assignment setup notifications.
truncate phase6_signals;
set local role anon;
select throws_ok($$select public.get_standings(pg_temp.p6_id(3,1))$$,'P0001','LEADERBOARD_HIDDEN','anonymous hidden standings denied');
select throws_ok($$select public.get_standings(pg_temp.p6_id(3,99))$$,'P0001','NOT_FOUND','unknown event distinguished');
select throws_ok($$select public.get_export_data(pg_temp.p6_id(3,1))$$,'42501',null,'anonymous export denied');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,2)])$$,'42501',null,'anonymous tie mutation denied');
select throws_ok($$select public.set_leaderboard_visibility(gen_random_uuid(),pg_temp.p6_id(3,1),true)$$,'42501',null,'anonymous visibility mutation denied');
select throws_ok($$select public.phase6_standings(pg_temp.p6_id(3,1))$$,'42501',null,'private standings builder not callable');
select throws_ok($$select public.phase6_invalidate_ties()$$,'42501',null,'internal trigger not callable');
select ok(not(public.get_team_view(pg_temp.p6_id(3,1),'T01')?'standing'),'hidden team view omits rank and total');
select ok(not exists(select 1 from jsonb_array_elements(public.get_schedule(pg_temp.p6_id(3,1))) x where x?'result_entered_at'),'hidden schedule omits result timestamps');
reset role;
set local role authenticated;
-- Guide, referee, unassigned, inactive admin and other-event member matrix.
select pg_temp.p6_denied(n) from unnest(array[3,4,5,6,7]) n;
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,3)::text,true);
select ok(not(public.get_team_view(pg_temp.p6_id(3,1),'T01')?'standing'),'referee hidden team view omits standing');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,2)::text,true);
select is(jsonb_array_length(public.get_standings(pg_temp.p6_id(3,1))),5,'admin sees every event team');
select is(pg_temp.p6_row('T01')->>'played','2','completed opening and regular count as played');
select is(pg_temp.p6_row('T01')->>'wins','2','opening uses ordinary WIN outcome');
select is(pg_temp.p6_row('T01')->>'match_points','4','current win points summed');
select is(pg_temp.p6_row('T01')->>'adjustment_points','3','event and match adjustments summed');
select is(pg_temp.p6_row('T01')->>'total','7','outcomes plus adjustments total');
select is(pg_temp.p6_row('T02')->>'total','5','scheduled nonvoid match adjustment counts without outcome points');
select is(pg_temp.p6_row('T03')->>'total','-4','negative total preserved');
select is(pg_temp.p6_row('T04')->>'forfeits','1','forfeits tracked separately');
select is(pg_temp.p6_row('T04')->>'losses','0','forfeit excluded from loss count');
select is(pg_temp.p6_row('T04')->>'draws','1','draw counted');
select is(pg_temp.p6_row('T04')->>'adjustment_points','0','revoked adjustment excluded');
select is(pg_temp.p6_row('T05')->>'total','0','zero-score team preserved');
select is(public.get_standings(pg_temp.p6_id(3,1))->0->'team'->>'code','T01','highest total sorted first');
select is(public.get_standings(pg_temp.p6_id(3,1))->4->'team'->>'code','T03','negative total sorted last');
select ok(public.get_team_view(pg_temp.p6_id(3,1),'T01')?'standing','admin sees team standing while hidden');
select is(public.get_team_view(pg_temp.p6_id(3,1),'T01')->'standing',pg_temp.p6_row('T01'),'team standing equals standings row');
select ok(not(pg_temp.p6_row('T01')->'team'->'guide'?'phone'),'standings omit guide phone even when card setting enabled');
select ok(exists(select 1 from jsonb_array_elements(public.get_schedule(pg_temp.p6_id(3,1))) x where x->>'result_entered_at' is not null),'authorized schedule carries result timestamps');
select throws_ok($$select public.get_standings(pg_temp.p6_id(3,2))$$,'P0001','LEADERBOARD_HIDDEN','admin role is event scoped');
select throws_ok($$select public.get_export_data(pg_temp.p6_id(3,2))$$,'P0001','FORBIDDEN','export role is event scoped');

select is(public.get_export_data(pg_temp.p6_id(3,1))->'standings',public.get_standings(pg_temp.p6_id(3,1)),'export exactly matches current standings');
select ok(public.get_export_data(pg_temp.p6_id(3,1))->>'generated_at' is not null,'export has generated timestamp');
select is(jsonb_array_length(public.get_export_data(pg_temp.p6_id(3,1))->'matches'),4,'export includes completed and pending matches');
select is(public.get_export_data(pg_temp.p6_id(3,1))->'matches'->0->>'round_type','OPENING','export identifies opening round');
select is(public.get_export_data(pg_temp.p6_id(3,1))->'matches'->0->'entered_by'->>'name_en','Phase Six 3','export attributes result entry');
select is(jsonb_array_length(public.get_export_data(pg_temp.p6_id(3,1))->'adjustments'),5,'export includes revoked adjustment history');
select ok(exists(select 1 from jsonb_array_elements(public.get_export_data(pg_temp.p6_id(3,1))->'adjustments') x where x->>'revoke_reason'='Correction'),'export preserves revoke reason');
select ok(exists(select 1 from jsonb_array_elements(public.get_export_data(pg_temp.p6_id(3,1))->'adjustments') x where x->>'reason'='Match bonus' and x->'given_by'->>'name_en'='Phase Six 3'),'export attributes adjustment giver');
select ok(exists(select 1 from jsonb_array_elements(public.get_export_data(pg_temp.p6_id(3,1))->'staff') x where x->>'role'='REFEREE' and x->'game_codes'='["G01"]'::jsonb),'export referee assignment codes');
select ok(exists(select 1 from jsonb_array_elements(public.get_export_data(pg_temp.p6_id(3,1))->'staff') x where x->>'role'='GUIDE' and x->>'team_code'='T01'),'export guide assignment code');
-- A public show_guide_phone boolean is metadata, not a private phone property.
select ok(public.get_export_data(pg_temp.p6_id(3,1))::text !~ '"(phone|auth_user_id|access_token|service_role|password)"[[:space:]]*:|20133333333','export excludes private field names and phone values');

select is(public.set_leaderboard_visibility(pg_temp.p6_id(9,1),pg_temp.p6_id(3,1),true)->>'leaderboard_public','true','admin enables public standings');
select is(public.set_leaderboard_visibility(pg_temp.p6_id(9,1),pg_temp.p6_id(3,1),true)->>'leaderboard_public','true','visibility exact replay');
select throws_ok($$select public.set_leaderboard_visibility(pg_temp.p6_id(9,1),pg_temp.p6_id(3,1),false)$$,'P0001','OP_ID_CONFLICT','visibility payload reuse rejected');
select throws_ok($$select public.set_leaderboard_visibility(gen_random_uuid(),pg_temp.p6_id(3,1),null)$$,'P0001','INVALID_VISIBILITY','null visibility rejected');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,1)::text,true);
select is(jsonb_array_length(public.get_standings(pg_temp.p6_id(3,2))),1,'owner sees hidden event without event role');
select lives_ok($$select public.get_export_data(pg_temp.p6_id(3,2))$$,'owner exports any event');
select throws_ok($$select public.set_leaderboard_visibility(pg_temp.p6_id(9,1),pg_temp.p6_id(3,1),true)$$,'P0001','OP_ID_CONFLICT','visibility replay actor bound');
select throws_ok($$select public.set_leaderboard_visibility(pg_temp.p6_id(9,1),pg_temp.p6_id(3,2),true)$$,'P0001','OP_ID_CONFLICT','visibility replay event bound');
reset role;
set local role anon;
select is(jsonb_array_length(public.get_standings(pg_temp.p6_id(3,1))),5,'anonymous sees public standings');
select ok(public.get_team_view(pg_temp.p6_id(3,1),'T01')?'standing','public team view adds standing');
select ok(exists(select 1 from jsonb_array_elements(public.get_schedule(pg_temp.p6_id(3,1))) x where x?'result_entered_at'),'public schedule adds result timestamps');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,3)::text,true);
select is(jsonb_array_length(public.get_standings(pg_temp.p6_id(3,1))),5,'referee sees public standings');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,4)::text,true);
select is(jsonb_array_length(public.get_standings(pg_temp.p6_id(3,1))),5,'guide sees public standings');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,2)::text,true);
select lives_ok($$select public.set_leaderboard_visibility(pg_temp.p6_id(9,2),pg_temp.p6_id(3,1),false)$$,'admin hides standings again');
select is(public.set_leaderboard_visibility(pg_temp.p6_id(9,1),pg_temp.p6_id(3,1),true)->>'leaderboard_public','true','old visibility receipt returned without applying new write');
reset role;
select is((select leaderboard_public from public.events where id=pg_temp.p6_id(3,1)),false,'old replay cannot undo newer visibility');
select is((select count(*)::int from public.audit_log where event_id=pg_temp.p6_id(3,1) and action='LEADERBOARD_VISIBILITY_SET'),2,'visibility retries do not duplicate audits');
select is((select count(*)::int from phase6_signals),2,'visibility retries do not duplicate signals');
select ok(not exists(select 1 from phase6_signals where payload<>'{"type":"settings_changed"}'::jsonb or is_private or topic<>'event:'||pg_temp.p6_id(3,1)::text),'signals contain only type and event topic');

-- Current point settings recalculate existing outcomes, including forfeits.
update public.events set points_win=5,points_draw=2,points_loss=1 where id=pg_temp.p6_id(3,1);
set local role authenticated;
select is(pg_temp.p6_row('T01')->>'match_points','10','new win config applies retroactively');
select is(pg_temp.p6_row('T04')->>'match_points','3','forfeit scores current loss points');
select is(pg_temp.p6_row('T03')->>'match_points','3','opening loss and regular draw use current config');
select is(public.get_export_data(pg_temp.p6_id(3,1))->'standings',public.get_standings(pg_temp.p6_id(3,1)),'export remains equal after points change');
select lives_ok($$select public.void_match(gen_random_uuid(),pg_temp.p6_id(7,1),'Cancelled race')$$,'void completed match');
select is(pg_temp.p6_row('T01')->>'match_points','5','void excludes retained WIN outcome');
select is(pg_temp.p6_row('T01')->>'adjustment_points','1','void excludes its MATCH adjustment but preserves EVENT adjustment');
select is(pg_temp.p6_row('T01')->>'played','1','void excludes played counter');
select ok(exists(select 1 from jsonb_array_elements(public.get_export_data(pg_temp.p6_id(3,1))->'matches') x where x->>'status'='VOID'),'export retains void history');
select lives_ok($$select public.reset_match_result(gen_random_uuid(),pg_temp.p6_id(7,1))$$,'reset restores void match to scheduled');
select is(pg_temp.p6_row('T01')->>'match_points','5','reset pending result awards no points');
select is(pg_temp.p6_row('T01')->>'adjustment_points','3','reset restores nonvoid MATCH adjustment');
select lives_ok($$select public.revoke_adjustment(gen_random_uuid(),pg_temp.p6_id(8,2),'Correct bonus')$$,'revoke active match adjustment');
select is(pg_temp.p6_row('T01')->>'adjustment_points','1','revocation removes adjustment total');
reset role;

-- Equal totals, deterministic shared competition rank, complete manual cohort.
update public.events set points_win=0,points_draw=0,points_loss=0 where id=pg_temp.p6_id(3,1);
update public.adjustments set revoked_at=coalesce(revoked_at,now()),revoke_reason='Tie fixture' where event_id=pg_temp.p6_id(3,1);
set local role authenticated;
select is((select count(*)::int from jsonb_array_elements(public.get_standings(pg_temp.p6_id(3,1))) x where x->>'rank'='1' and x->>'is_tied'='true'),5,'all unresolved equal totals share rank');
select is(public.get_standings(pg_temp.p6_id(3,1))->0->'team'->>'code','T01','unresolved ties sort by name');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),null)$$,'P0001','INVALID_TIEBREAK','null tie order rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[]::uuid[])$$,'P0001','INVALID_TIEBREAK','empty tie order rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1)])$$,'P0001','INVALID_TIEBREAK','single team rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,1)])$$,'P0001','INVALID_TIEBREAK','duplicate teams rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),null])$$,'P0001','INVALID_TIEBREAK','null team rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[[pg_temp.p6_id(4,1),pg_temp.p6_id(4,2)]])$$,'P0001','INVALID_TIEBREAK','multidimensional tie order rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,2)])$$,'P0001','INVALID_TIEBREAK','partial tied cohort rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,99)])$$,'P0001','INVALID_TIEBREAK','cross-event team rejected');
select lives_ok($$select public.set_tiebreak(pg_temp.p6_id(9,3),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,5),pg_temp.p6_id(4,4),pg_temp.p6_id(4,3),pg_temp.p6_id(4,2),pg_temp.p6_id(4,1)])$$,'admin resolves complete tied cohort');
select is(public.get_standings(pg_temp.p6_id(3,1))->0->'team'->>'code','T05','manual order changes first team');
select is(pg_temp.p6_row('T01')->>'rank','5','resolved cohort receives distinct rank');
select is(pg_temp.p6_row('T01')->>'final_tiebreak_pos','5','manual position exposed');
select ok(not exists(select 1 from jsonb_array_elements(public.get_standings(pg_temp.p6_id(3,1))) x where (x->>'is_tied')::boolean),'resolved cohort has no tie badge');
select lives_ok($$select public.set_tiebreak(pg_temp.p6_id(9,3),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,5),pg_temp.p6_id(4,4),pg_temp.p6_id(4,3),pg_temp.p6_id(4,2),pg_temp.p6_id(4,1)])$$,'tie exact replay succeeds');
select throws_ok($$select public.set_tiebreak(pg_temp.p6_id(9,3),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,2),pg_temp.p6_id(4,3),pg_temp.p6_id(4,4),pg_temp.p6_id(4,5)])$$,'P0001','OP_ID_CONFLICT','changed manual ordering cannot reuse op id');
select throws_ok($$select public.set_leaderboard_visibility(pg_temp.p6_id(9,3),pg_temp.p6_id(3,1),true)$$,'P0001','OP_ID_CONFLICT','operation IDs cannot cross mutation RPCs');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,1)::text,true);
select throws_ok($$select public.set_tiebreak(pg_temp.p6_id(9,3),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,5),pg_temp.p6_id(4,4),pg_temp.p6_id(4,3),pg_temp.p6_id(4,2),pg_temp.p6_id(4,1)])$$,'P0001','OP_ID_CONFLICT','tie replay actor bound');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,2)::text,true);
select lives_ok($$select public.set_leaderboard_visibility(gen_random_uuid(),pg_temp.p6_id(3,1),true)$$,'visibility alone changes no scores');
select is(pg_temp.p6_row('T01')->>'final_tiebreak_pos','5','visibility preserves manual order');
reset role;
select is((select count(*)::int from public.audit_log where event_id=pg_temp.p6_id(3,1) and action='TIEBREAK_SET'),1,'tie retries do not duplicate audit');
select ok(exists(select 1 from public.audit_log where event_id=pg_temp.p6_id(3,1) and action='TIEBREAK_SET' and actor_id=pg_temp.p6_id(2,2) and after->>'total'='0'),'tie audit binds actor and current total');
update public.events set points_win=1 where id=pg_temp.p6_id(3,1);
select is((select count(*)::int from public.teams where event_id=pg_temp.p6_id(3,1) and final_tiebreak_pos is not null),0,'points change clears manual positions');
set local role authenticated;
select lives_ok($$select public.set_tiebreak(pg_temp.p6_id(9,3),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,5),pg_temp.p6_id(4,4),pg_temp.p6_id(4,3),pg_temp.p6_id(4,2),pg_temp.p6_id(4,1)])$$,'old tie replay returns receipt after scoring change');
select is(pg_temp.p6_row('T01')->>'final_tiebreak_pos',null,'old replay never reapplies invalidated manual positions');
select is(pg_temp.p6_row('T01')->>'rank','1','unresolved top cohort shares rank');
select is(pg_temp.p6_row('T03')->>'rank','3','competition rank skips tied team count');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,3)])$$,'P0001','INVALID_TIEBREAK','unequal totals rejected');
select lives_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,2),pg_temp.p6_id(4,1)])$$,'resolve current top cohort independently');
select is(pg_temp.p6_row('T02')->>'rank','1','resolved top team has rank one');
select is(pg_temp.p6_row('T01')->>'rank','2','resolved top teammate has rank two');
select is(pg_temp.p6_row('T03')->>'is_tied','true','other cohort remains unresolved');
select is(public.get_export_data(pg_temp.p6_id(3,1))->'standings',public.get_standings(pg_temp.p6_id(3,1)),'resolved export matches on-screen standings');
reset role;

-- Each mutation family invalidates ties, including equal-total changes.
update public.match_participants set outcome='WIN' where match_id=pg_temp.p6_id(7,0) and team_id=pg_temp.p6_id(4,1);
select is((select count(*)::int from public.teams where event_id=pg_temp.p6_id(3,1) and final_tiebreak_pos is not null),0,'result write clears manual order even if total remains equal');
update public.teams set final_tiebreak_pos=case code when 'T01' then 1 else 2 end where id in(pg_temp.p6_id(4,1),pg_temp.p6_id(4,2));
update public.matches set status='VOID' where id=pg_temp.p6_id(7,3);
select is((select count(*)::int from public.teams where event_id=pg_temp.p6_id(3,1) and final_tiebreak_pos is not null),0,'match status change clears manual order');
update public.teams set final_tiebreak_pos=case code when 'T01' then 1 else 2 end where id in(pg_temp.p6_id(4,1),pg_temp.p6_id(4,2));
update public.adjustments set revoke_reason='Changed history' where id=pg_temp.p6_id(8,1);
select is((select count(*)::int from public.teams where event_id=pg_temp.p6_id(3,1) and final_tiebreak_pos is not null),0,'adjustment change clears manual order');
update public.teams set final_tiebreak_pos=case code when 'T01' then 1 else 2 end where id in(pg_temp.p6_id(4,1),pg_temp.p6_id(4,2));
update public.teams set name_en='Renamed team' where id=pg_temp.p6_id(4,5);
select is((select count(*)::int from public.teams where event_id=pg_temp.p6_id(3,1) and final_tiebreak_pos is not null),0,'roster edit clears manual order');
update public.teams set final_tiebreak_pos=case code when 'T01' then 1 else 2 end where id in(pg_temp.p6_id(4,1),pg_temp.p6_id(4,2));
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values(pg_temp.p6_id(4,6),pg_temp.p6_id(3,1),'T06','New Team','falcon','#123456');
select is((select count(*)::int from public.teams where event_id=pg_temp.p6_id(3,1) and final_tiebreak_pos is not null),0,'new team invalidates old tie cohorts');
set local role authenticated;
select is(pg_temp.p6_row('T06')->>'played','0','team without matches has zero played');
select is(pg_temp.p6_row('T06')->>'total','0','team without matches has zero total');
select throws_ok($$select id from public.teams$$,'42501',null,'standings RPC does not grant direct table reads');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,2)::text,true);
reset role;
delete from public.event_roles where event_id=pg_temp.p6_id(3,1) and member_id=pg_temp.p6_id(2,2);
set local role authenticated;
select throws_ok($$select public.set_tiebreak(pg_temp.p6_id(9,3),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,5),pg_temp.p6_id(4,4),pg_temp.p6_id(4,3),pg_temp.p6_id(4,2),pg_temp.p6_id(4,1)])$$,'P0001','FORBIDDEN','revoked admin cannot replay prior tie mutation');
select throws_ok($$select public.set_leaderboard_visibility(pg_temp.p6_id(9,1),pg_temp.p6_id(3,1),true)$$,'P0001','FORBIDDEN','revoked admin cannot replay prior visibility mutation');
select set_config('request.jwt.claim.sub',pg_temp.p6_id(1,1)::text,true);
select lives_ok($$select public.set_leaderboard_visibility(gen_random_uuid(),pg_temp.p6_id(3,2),true)$$,'owner changes visibility without event role');
select lives_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,2),pg_temp.p6_id(4,1)])$$,'owner resolves tie without event role');
select is(pg_temp.p6_row('T02')->>'rank','1','owner order is applied');
select throws_ok($$select public.set_leaderboard_visibility(gen_random_uuid(),pg_temp.p6_id(3,99),true)$$,'P0001','NOT_FOUND','owner unknown visibility event rejected');
select throws_ok($$select public.set_tiebreak(gen_random_uuid(),pg_temp.p6_id(3,99),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,2)])$$,'P0001','NOT_FOUND','owner unknown tie event rejected');
select throws_ok($$select public.get_export_data(pg_temp.p6_id(3,99))$$,'P0001','NOT_FOUND','owner unknown export event rejected');
select throws_ok($$select public.set_leaderboard_visibility(null,pg_temp.p6_id(3,1),true)$$,'P0001','INVALID_OP_ID','visibility requires operation id');
select throws_ok($$select public.set_tiebreak(null,pg_temp.p6_id(3,1),array[pg_temp.p6_id(4,1),pg_temp.p6_id(4,2)])$$,'P0001','INVALID_OP_ID','tie requires operation id');
reset role;
delete from public.teams where id=pg_temp.p6_id(4,6);
select is((select count(*)::int from public.teams where event_id=pg_temp.p6_id(3,1) and final_tiebreak_pos is not null),0,'roster deletion clears manual order');
insert into public.events(id,code,name_en) values(pg_temp.p6_id(3,3),'P6-EMPTY','Empty event');
set local role authenticated;
select is(public.get_standings(pg_temp.p6_id(3,3)),'[]'::jsonb,'empty event yields an empty standings array');
select is(public.get_export_data(pg_temp.p6_id(3,3))->'standings','[]'::jsonb,'empty export has standings array');
select is(public.get_export_data(pg_temp.p6_id(3,3))->'matches','[]'::jsonb,'empty export has matches array');
select is(public.get_export_data(pg_temp.p6_id(3,3))->'adjustments','[]'::jsonb,'empty export has adjustments array');
select is(public.get_export_data(pg_temp.p6_id(3,3))->'staff','[]'::jsonb,'empty export has staff array');
reset role;
select * from finish();
rollback;
