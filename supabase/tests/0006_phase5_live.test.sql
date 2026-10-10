begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Keep the production emit body and whitelist, replacing only its transport
-- target inside this rolled-back transaction. Realtime schema is untouched.
create temp table phase5_signals(payload jsonb,event text,topic text,is_private boolean);
create function pg_temp.phase5_capture(jsonb,text,text,boolean) returns void
language sql as $$ insert into pg_temp.phase5_signals values($1,$2,$3,$4) $$;
do $spy$
begin
  execute replace(pg_get_functiondef('public.emit(uuid,text,jsonb)'::regprocedure),'realtime.send(','pg_temp.phase5_capture(');
end $spy$;

insert into auth.users(id)
select ('15000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,7) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,system_role,is_active)
select ('25000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('15000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'phase5_private_'||n,'+20122222222'||n,'Phase Five '||n,case when n=1 then 'OWNER' else 'MEMBER' end,n<>6
from generate_series(1,7) n;
insert into public.events(id,code,name_en,match_bonus_cap,match_penalty_cap,event_bonus_cap,event_penalty_cap) values
('35000000-0000-0000-0000-000000000001','P5-EVENT','Phase Five',3,2,5,0),
('35000000-0000-0000-0000-000000000002','P5-OTHER','Other',3,2,5,0);
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex)
select ('45000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'35000000-0000-0000-0000-000000000001','T0'||n,'Team '||n,'falcon','#123456' from generate_series(1,4) n;
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
('45000000-0000-0000-0000-000000000098','35000000-0000-0000-0000-000000000002','T02','Other B','lion','#654321'),
('45000000-0000-0000-0000-000000000099','35000000-0000-0000-0000-000000000002','T01','Other A','falcon','#123456');
insert into public.games(id,event_id,code,name_en) values
('55000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','G01','Race'),
('55000000-0000-0000-0000-000000000002','35000000-0000-0000-0000-000000000001','G02','Puzzle'),
('55000000-0000-0000-0000-000000000099','35000000-0000-0000-0000-000000000002','G99','Other Race');
insert into public.rounds(id,event_id,number,type,duration_min)
select ('65000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'35000000-0000-0000-0000-000000000001',n,case when n=0 then 'OPENING' else 'REGULAR' end,10 from generate_series(0,3) n;
insert into public.rounds(id,event_id,number,duration_min) values('65000000-0000-0000-0000-000000000099','35000000-0000-0000-0000-000000000002',1,10);
insert into public.matches(id,event_id,round_id,game_id) values
('75000000-0000-0000-0000-000000000000','35000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000000','55000000-0000-0000-0000-000000000001'),
('75000000-0000-0000-0000-000000000001','35000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001'),
('75000000-0000-0000-0000-000000000002','35000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000002'),
('75000000-0000-0000-0000-000000000003','35000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000002','55000000-0000-0000-0000-000000000001'),
('75000000-0000-0000-0000-000000000004','35000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000003','55000000-0000-0000-0000-000000000001'),
('75000000-0000-0000-0000-000000000099','35000000-0000-0000-0000-000000000002','65000000-0000-0000-0000-000000000099','55000000-0000-0000-0000-000000000099');
insert into public.match_participants(match_id,round_id,team_id,side)
select '75000000-0000-0000-0000-000000000000','65000000-0000-0000-0000-000000000000',id,null from public.teams where event_id='35000000-0000-0000-0000-000000000001';
insert into public.match_participants(match_id,round_id,team_id,side) values
('75000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','A'),
('75000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002','B'),
('75000000-0000-0000-0000-000000000002','65000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000003','A'),
('75000000-0000-0000-0000-000000000002','65000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000004','B'),
('75000000-0000-0000-0000-000000000003','65000000-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000001','A'),
('75000000-0000-0000-0000-000000000003','65000000-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000002','B'),
('75000000-0000-0000-0000-000000000004','65000000-0000-0000-0000-000000000003','45000000-0000-0000-0000-000000000001','A'),
('75000000-0000-0000-0000-000000000099','65000000-0000-0000-0000-000000000099','45000000-0000-0000-0000-000000000099','A'),
('75000000-0000-0000-0000-000000000099','65000000-0000-0000-0000-000000000099','45000000-0000-0000-0000-000000000098','B');
insert into public.event_roles(event_id,member_id,role,team_id) values
('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000002','EVENT_ADMIN',null),
('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000003','REFEREE',null),
('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000004','GUIDE','45000000-0000-0000-0000-000000000001'),
('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000005','REFEREE',null),
('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000006','EVENT_ADMIN',null);
insert into public.referee_games values
('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000003','55000000-0000-0000-0000-000000000001'),
('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000005','55000000-0000-0000-0000-000000000002');
create temp table phase5_payloads(kind text,payload jsonb);
insert into phase5_payloads
select 'regular-valid',jsonb_build_array(jsonb_build_object('team_id','45000000-0000-0000-0000-000000000001','outcome',a),jsonb_build_object('team_id','45000000-0000-0000-0000-000000000002','outcome',b))
from (values('WIN','LOSS'),('LOSS','WIN'),('DRAW','DRAW'),('FORFEIT','WIN'),('WIN','FORFEIT'),('FORFEIT','FORFEIT')) p(a,b);
insert into phase5_payloads
select 'regular-invalid',jsonb_build_array(jsonb_build_object('team_id','45000000-0000-0000-0000-000000000001','outcome',a),jsonb_build_object('team_id','45000000-0000-0000-0000-000000000002','outcome',b))
from (values('WIN','WIN'),('LOSS','LOSS'),('DRAW','WIN'),('FORFEIT','LOSS'),('PENDING','WIN')) p(a,b);
insert into phase5_payloads
select 'opening-valid',jsonb_agg(jsonb_build_object('team_id',('45000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'outcome',p.outcomes[n]) order by n)
from (values(array['WIN','WIN','LOSS','FORFEIT']), (array['WIN','WIN','WIN','WIN']), (array['FORFEIT','FORFEIT','FORFEIT','FORFEIT'])) p(outcomes)
cross join generate_series(1,4) n group by p.outcomes;
insert into phase5_payloads
select 'opening-invalid',jsonb_agg(jsonb_build_object('team_id',('45000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'outcome',p.outcomes[n]) order by n)
from (values(array['WIN','DRAW','LOSS','LOSS']), (array['LOSS','LOSS','LOSS','FORFEIT'])) p(outcomes)
cross join generate_series(1,4) n group by p.outcomes;
create temp table phase5_errors(code text,detail jsonb);
grant select on phase5_payloads,phase5_errors to authenticated;
grant insert on phase5_errors to authenticated;

set local role anon;
select throws_ok($$select public.get_live_event('35000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot read live administration');
select throws_ok($$select public.get_referee_board('35000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot read operational referee results');
select throws_ok($$select public.get_match_entry('75000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot read operational match entry');
select throws_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot start rounds');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','[]')$$,'42501',null,'anonymous cannot submit results');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.get_referee_board('35000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','guide cannot read referee operations');
select throws_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','guide cannot start rounds');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','[]')$$,'P0001','FORBIDDEN','guide cannot submit results');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000007',true);
select throws_ok($$select public.get_live_event('35000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','unassigned member cannot read live administration');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','[]')$$,'P0001','FORBIDDEN','unassigned member cannot submit results');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.get_live_event('35000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','inactive admin cannot read live administration');
select throws_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','inactive admin cannot mutate rounds');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.get_live_event('35000000-0000-0000-0000-000000000001')->'matches'),5,'owner reads every event match across all round states');
select is(jsonb_array_length(public.get_live_event('35000000-0000-0000-0000-000000000002')->'matches'),1,'owner reads another event without crossing its match scope');
select throws_ok($$select public.get_live_event('35000000-0000-0000-0000-000000000999')$$,'P0001','NOT_FOUND','live read reports missing event');
select throws_ok($$select public.get_referee_board('35000000-0000-0000-0000-000000000999')$$,'P0001','NOT_FOUND','referee board reports missing event');
select throws_ok($$select public.get_match_entry('75000000-0000-0000-0000-000000000999')$$,'P0001','NOT_FOUND','entry reports missing match');
select throws_ok($$select public.get_pending_matches('65000000-0000-0000-0000-000000000999')$$,'P0001','NOT_FOUND','pending list reports missing round');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
select is(public.get_live_event('35000000-0000-0000-0000-000000000001')->'event'->>'match_bonus_cap','3','live event includes operational caps');
select throws_ok($$select public.get_live_event('35000000-0000-0000-0000-000000000002')$$,'P0001','FORBIDDEN','admin cannot read another event live operations');
select throws_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000003')$$,'P0001','INVALID_ROUND_MATCHES','start rejects a regular match with only one participant');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.get_referee_board('35000000-0000-0000-0000-000000000001')->'matches'),0,'referee board has no draft matches');
select is(jsonb_array_length(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'matches'),1,'assigned match entry contains exactly one match');
select is(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'matches'->0->'participants'->0->>'outcome','PENDING','assigned operational entry includes hidden outcomes');
select throws_ok($$select public.get_match_entry('75000000-0000-0000-0000-000000000002')$$,'P0001','FORBIDDEN','referee cannot read an unassigned game');
select throws_ok($$select public.get_match_entry('75000000-0000-0000-0000-000000000099')$$,'P0001','FORBIDDEN','referee cannot read another event match');
select throws_ok($$select public.get_pending_matches('65000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee cannot read administrative pending list');
select throws_ok($$select public.reset_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee cannot reset results');
select throws_ok($$select public.void_match(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','Reason')$$,'P0001','FORBIDDEN','referee cannot void matches');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' limit 1))$$,'P0001','ROUND_NOT_ACTIVE','referee cannot submit in draft rounds');
select throws_ok(format('select public.%I(gen_random_uuid(),%L%s)',rpc,'65000000-0000-0000-0000-000000000001',args),'P0001','FORBIDDEN','referee cannot '||rpc)
from (values('start_round',''),('extend_round',',5'),('close_round',''),('reopen_round',',''Reason''')) actions(rpc,args);

reset role;
delete from public.match_participants where match_id='75000000-0000-0000-0000-000000000000' and team_id='45000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000000')$$,'P0001','INVALID_ROUND_MATCHES','opening start requires the complete event roster');
reset role;
insert into public.match_participants(match_id,round_id,team_id) values('75000000-0000-0000-0000-000000000000','65000000-0000-0000-0000-000000000000','45000000-0000-0000-0000-000000000004');
set local role authenticated;

select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
select is(public.start_round('95000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001')->>'status','ACTIVE','admin starts valid round');
select is(public.start_round('95000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001')->>'status','ACTIVE','start replay succeeds after transition');
select is(public.get_live_event('35000000-0000-0000-0000-000000000001')->'event'->>'status','LIVE','starting changes draft event to live');
select throws_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001')$$,'P0001','ROUND_NOT_DRAFT','fresh operation cannot start active round twice');
select throws_ok($$select public.start_round('95000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000002')$$,'P0001','OP_ID_CONFLICT','operation id is bound to round');
select throws_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000002')$$,'P0001','ACTIVE_ROUND_EXISTS','one active round is enforced');
select is(public.extend_round('95000000-0000-0000-0000-000000000002','65000000-0000-0000-0000-000000000001',5)->>'extension_min','5','admin extends active round');
select is(public.extend_round('95000000-0000-0000-0000-000000000002','65000000-0000-0000-0000-000000000001',5)->>'extension_min','5','extension replay is applied once');
select throws_ok($$select public.extend_round('95000000-0000-0000-0000-000000000002','65000000-0000-0000-0000-000000000001',6)$$,'P0001','OP_ID_CONFLICT','changed operation payload conflicts');
select throws_ok($$select public.extend_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001',0)$$,'P0001','INVALID_MINUTES','zero extension is invalid');
select throws_ok($$select public.extend_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001',121)$$,'P0001','INVALID_MINUTES','extension over 120 is invalid');
select throws_ok($$select public.close_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001')$$,'P0001','PENDING_MATCHES','pending scheduled matches block close');
do $capture$ declare v_detail text; begin
  perform public.close_round('95000000-0000-0000-0000-000000000099','65000000-0000-0000-0000-000000000001');
exception when sqlstate 'P0001' then get stacked diagnostics v_detail=pg_exception_detail; insert into phase5_errors values(sqlerrm,v_detail::jsonb); end $capture$;
select ok((select detail->'match_ids' from phase5_errors where code='PENDING_MATCHES') @> '["75000000-0000-0000-0000-000000000001","75000000-0000-0000-0000-000000000002"]','close error details identify pending matches');
select is(jsonb_array_length(public.get_pending_matches('65000000-0000-0000-0000-000000000001')),2,'admin can fetch pending match cards');
reset role;
select is((select count(*)::int from public.audit_log where event_id='35000000-0000-0000-0000-000000000001' and action='ROUND_STARTED'),1,'start replay writes only one audit');
select is((select count(*)::int from public.client_ops where op_id='95000000-0000-0000-0000-000000000099'),0,'failed close consumes no operation id');
update public.rounds set started_at=now()-interval '100 minutes' where id='65000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.get_referee_board('35000000-0000-0000-0000-000000000001')->'matches'),1,'board only contains assigned active match');
select is(public.submit_match_result('95000000-0000-0000-0000-000000000003','75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' and payload->0->>'outcome'='WIN' and payload->1->>'outcome'='LOSS'))->>'status','COMPLETED','referee submits during overtime');
select is(public.submit_match_result('95000000-0000-0000-0000-000000000003','75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' and payload->0->>'outcome'='WIN' and payload->1->>'outcome'='LOSS'))->>'status','COMPLETED','result replay returns original completion');
select throws_ok($$select public.submit_match_result('95000000-0000-0000-0000-000000000003','75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' and payload->0->>'outcome'='DRAW'))$$,'P0001','OP_ID_CONFLICT','result replay rejects changed outcomes');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000002','[]')$$,'P0001','FORBIDDEN','referee cannot submit an unassigned match');
select lives_ok(format('select public.submit_match_result(gen_random_uuid(),%L,%L::jsonb)','75000000-0000-0000-0000-000000000001',payload::text),'regular valid pair '||payload::text) from phase5_payloads where kind='regular-valid';
select throws_ok(format('select public.submit_match_result(gen_random_uuid(),%L,%L::jsonb)','75000000-0000-0000-0000-000000000001',payload::text),'P0001','INVALID_OUTCOMES','invalid regular pair '||payload::text) from phase5_payloads where kind='regular-invalid';
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','{}')$$,'P0001','INVALID_OUTCOMES','outcomes must be an array');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','[42,42]')$$,'P0001','INVALID_OUTCOMES','outcome rows must be objects');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','[{"team_id":"45000000-0000-0000-0000-000000000001","outcome":"WIN"}]')$$,'P0001','INVALID_OUTCOMES','every participant requires an outcome');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','[{"team_id":"45000000-0000-0000-0000-000000000001","outcome":"WIN"},{"team_id":"45000000-0000-0000-0000-000000000001","outcome":"LOSS"}]')$$,'P0001','INVALID_OUTCOMES','participant identifiers cannot repeat');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','[{"team_id":"45000000-0000-0000-0000-000000000001","outcome":"WIN"},{"team_id":"45000000-0000-0000-0000-000000000099","outcome":"LOSS"}]')$$,'P0001','INVALID_OUTCOMES','cross-event participant identifiers are rejected');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{0,points}','100') from phase5_payloads where kind='regular-valid' limit 1))$$,'P0001','INVALID_OUTCOMES','outcome records reject unsupported fields');
select is(public.get_referee_board('35000000-0000-0000-0000-000000000001')->'rounds'->1->>'status','ACTIVE','overtime never auto-closes the round');
select ok(public.get_referee_board('35000000-0000-0000-0000-000000000001')::text !~ '"(auth_user_id|username|phone|void_reason)"[[:space:]]*:','operational response excludes account and protected fields');
select ok(not (public.get_schedule('35000000-0000-0000-0000-000000000001')->1->'participants'->0 ? 'outcome'),'operational reads never expand public hidden schedule access');
reset role;
select is((select count(*)::int from public.audit_log where entity_id='75000000-0000-0000-0000-000000000001' and action in ('MATCH_RESULT_SUBMITTED','MATCH_RESULT_CORRECTED')),7,'result replays and rejected combinations add no audit entries');
set local role authenticated;

select is(public.add_adjustment('95000000-0000-0000-0000-000000000010','35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',2,'Ref bonus')->>'points','2','referee adds match bonus');
select is(public.add_adjustment('95000000-0000-0000-0000-000000000010','35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',2,'Ref bonus')->>'points','2','adjustment replay does not duplicate bonus');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',2,'Over cap')$$,'P0001','CAP_EXCEEDED','positive cap sums existing bonuses');
do $capture$ declare v_detail text; begin
  perform public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',2,'Over cap');
exception when sqlstate 'P0001' then get stacked diagnostics v_detail=pg_exception_detail; insert into phase5_errors values(sqlerrm,v_detail::jsonb); end $capture$;
select is((select detail->>'remaining' from phase5_errors where code='CAP_EXCEEDED'),'1','cap error reports remaining allowance');
select lives_ok($$select public.add_adjustment('95000000-0000-0000-0000-000000000011','35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',1,'Last bonus')$$,'cap permits exact remaining allowance');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',-2,'Penalty')$$,'negative cap is separate from positive cap');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',-1,'More penalty')$$,'P0001','CAP_EXCEEDED','penalty cap sums absolute negative points');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002',3,'Other team bonus')$$,'match caps are independent for each team');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','EVENT',null,'45000000-0000-0000-0000-000000000001',1,'Event bonus')$$,'P0001','FORBIDDEN','referee cannot grant event scope adjustments');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000003',1,'Other game')$$,'P0001','FORBIDDEN','referee cannot adjust unassigned match');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.add_adjustment('95000000-0000-0000-0000-000000000012','35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002',-1,'Admin penalty')$$,'admin may add match adjustment');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000003',3,'Other match bonus')$$,'caps are independent across matches');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','EVENT',null,'45000000-0000-0000-0000-000000000001',5,'Event bonus')$$,'admin adds event scope bonus separately from match cap');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','EVENT',null,'45000000-0000-0000-0000-000000000001',1,'Over event cap')$$,'P0001','CAP_EXCEEDED','event cap sums only event adjustments');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','EVENT',null,'45000000-0000-0000-0000-000000000001',-1,'Disabled penalty')$$,'P0001','CAP_EXCEEDED','zero cap disables penalties');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000099','45000000-0000-0000-0000-000000000001',1,'Cross event')$$,'P0001','INVALID_ADJUSTMENT','match and event must agree');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000003',1,'Not participant')$$,'P0001','INVALID_ADJUSTMENT','match adjustment team must participate');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','EVENT',null,'45000000-0000-0000-0000-000000000001',0,'Zero adjustment')$$,'P0001','INVALID_ADJUSTMENT','zero adjustment is rejected');
reset role;
update public.events set event_bonus_cap=null where id='35000000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','EVENT',null,'45000000-0000-0000-0000-000000000001',100,'Unlimited bonus')$$,'null cap permits unlimited additions');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000003',true);
select ok(not exists(select 1 from jsonb_array_elements(public.get_referee_board('35000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'match_id' is distinct from '75000000-0000-0000-0000-000000000001'),'referee board excludes event and unassigned adjustments');
select throws_ok($$select public.revoke_adjustment(gen_random_uuid(),(select (a->>'id')::uuid from jsonb_array_elements(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'reason'='Admin penalty'),'Not my penalty')$$,'P0001','FORBIDDEN','referee cannot revoke another giver adjustment');
select is(public.revoke_adjustment('95000000-0000-0000-0000-000000000013',(select (a->>'id')::uuid from jsonb_array_elements(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'reason'='Ref bonus'),'Corrected bonus')->>'revoked','true','referee revokes own adjustment in active round');
select is(public.revoke_adjustment('95000000-0000-0000-0000-000000000013',(select (a->>'id')::uuid from jsonb_array_elements(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'reason'='Ref bonus'),'Corrected bonus')->>'revoked','true','revocation exact replay succeeds');
select throws_ok($$select public.revoke_adjustment(gen_random_uuid(),(select (a->>'id')::uuid from jsonb_array_elements(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'reason'='Ref bonus'),'Already revoked')$$,'P0001','ADJUSTMENT_REVOKED','fresh revocation cannot revoke twice');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'35000000-0000-0000-0000-000000000001','MATCH','75000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001',2,'Reused allowance')$$,'revocation restores cap allowance');
select ok(exists(select 1 from jsonb_array_elements(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'reason'='Ref bonus' and a->>'revoked_at' is not null),'staff sees revoked adjustment history');
select ok(not exists(select 1 from jsonb_array_elements(public.get_team_view('35000000-0000-0000-0000-000000000001','T01')->'adjustments') a where a->>'reason'='Ref bonus'),'public team view hides revoked adjustments');

select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
select lives_ok(format('select public.submit_match_result(gen_random_uuid(),%L,%L::jsonb)','75000000-0000-0000-0000-000000000000',payload::text),'opening valid set '||payload::text) from phase5_payloads where kind='opening-valid';
select throws_ok(format('select public.submit_match_result(gen_random_uuid(),%L,%L::jsonb)','75000000-0000-0000-0000-000000000000',payload::text),'P0001','INVALID_OUTCOMES','opening invalid set '||payload::text) from phase5_payloads where kind='opening-invalid';
select throws_ok($$select public.void_match(gen_random_uuid(),'75000000-0000-0000-0000-000000000002','x')$$,'P0001','INVALID_REASON','void requires a meaningful reason');
select is(public.void_match('95000000-0000-0000-0000-000000000014','75000000-0000-0000-0000-000000000002','Cancelled station')->>'status','VOID','admin voids pending match');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000002','[]')$$,'P0001','MATCH_VOID','void match requires reset before submission');
select is(jsonb_array_length(public.get_pending_matches('65000000-0000-0000-0000-000000000001')),0,'void and completed matches are not pending');
select is(public.close_round('95000000-0000-0000-0000-000000000015','65000000-0000-0000-0000-000000000001')->>'status','CLOSED','admin closes completed or void round');
select is(public.close_round('95000000-0000-0000-0000-000000000015','65000000-0000-0000-0000-000000000001')->>'status','CLOSED','close replay succeeds after transition');
select throws_ok($$select public.extend_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001',5)$$,'P0001','ROUND_NOT_ACTIVE','closed round cannot be extended');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.get_referee_board('35000000-0000-0000-0000-000000000001')->'matches'),0,'closed matches leave referee board');
select is(jsonb_array_length(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'matches'),1,'referee may still view assigned closed match');
select throws_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' limit 1))$$,'P0001','ROUND_NOT_ACTIVE','referee cannot correct closed match');
select is(public.submit_match_result('95000000-0000-0000-0000-000000000003','75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' and payload->0->>'outcome'='WIN' and payload->1->>'outcome'='LOSS'))->>'status','COMPLETED','prior acknowledged result can replay after closure');
select throws_ok($$select public.revoke_adjustment(gen_random_uuid(),(select (a->>'id')::uuid from jsonb_array_elements(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'reason'='Last bonus'),'Closed revoke')$$,'P0001','ROUND_NOT_ACTIVE','referee cannot revoke after close');
reset role;
delete from public.referee_games where event_id='35000000-0000-0000-0000-000000000001' and member_id='25000000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok($$select public.submit_match_result('95000000-0000-0000-0000-000000000003','75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' and payload->0->>'outcome'='WIN' and payload->1->>'outcome'='LOSS'))$$,'P0001','FORBIDDEN','revoked assignment prevents even operation replay');
reset role;
insert into public.referee_games values('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000003','55000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.start_round('95000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001')$$,'P0001','OP_ID_CONFLICT','operation replay is actor bound');
select is(public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000099')->>'status','ACTIVE','owner starts rounds in another event');
select is(public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000099','[{"team_id":"45000000-0000-0000-0000-000000000099","outcome":"WIN"},{"team_id":"45000000-0000-0000-0000-000000000098","outcome":"LOSS"}]')->>'status','COMPLETED','owner submits another event result');
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.submit_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001',(select payload from phase5_payloads where kind='regular-valid' limit 1))$$,'admin can correct closed round');
select is(public.revoke_adjustment(gen_random_uuid(),(select (a->>'id')::uuid from jsonb_array_elements(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'adjustments') a where a->>'reason'='Last bonus'),'Admin closed correction')->>'revoked','true','admin can revoke another giver adjustment after close');
select throws_ok($$select public.reopen_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001','x')$$,'P0001','INVALID_REASON','reopen requires a meaningful reason');
select is(public.reopen_round('95000000-0000-0000-0000-000000000016','65000000-0000-0000-0000-000000000001','Review results')->>'status','ACTIVE','admin reopens closed round');
select is(public.reopen_round('95000000-0000-0000-0000-000000000016','65000000-0000-0000-0000-000000000001','Review results')->>'status','ACTIVE','reopen replay succeeds after transition');
select is((public.get_live_event('35000000-0000-0000-0000-000000000001')->'rounds'->1->>'started_at')::timestamptz,now()-interval '100 minutes','reopen preserves original timer');
select is(public.get_live_event('35000000-0000-0000-0000-000000000001')->'rounds'->1->>'is_overtime','true','reopened elapsed round remains overtime');
select lives_ok($$select public.close_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001')$$,'completed reopened round can close again');
select lives_ok($$select public.start_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000002')$$,'another draft round can start after close');
select throws_ok($$select public.reopen_round(gen_random_uuid(),'65000000-0000-0000-0000-000000000001','Review again')$$,'P0001','ACTIVE_ROUND_EXISTS','reopen cannot create two active rounds');
select is(public.reset_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000002')->>'status','SCHEDULED','admin reset restores void match to scheduled');
select is(public.reset_match_result(gen_random_uuid(),'75000000-0000-0000-0000-000000000001')->'participants'->0->>'outcome','PENDING','reset clears every result outcome');
select is(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'matches'->0->'result_entered_by','null'::jsonb,'reset clears result attribution');
select is(public.get_match_entry('75000000-0000-0000-0000-000000000001')->'matches'->0->'result_entered_at','null'::jsonb,'reset clears result timestamp');
reset role;
select is((select void_reason from public.matches where id='75000000-0000-0000-0000-000000000002'),null::text,'reset clears void reason');
select is((select count(*)::int from public.audit_log where event_id='35000000-0000-0000-0000-000000000001' and action='ROUND_REOPENED'),1,'reopen audit is written once');
select ok(exists(select 1 from public.audit_log where event_id='35000000-0000-0000-0000-000000000001' and action='MATCH_RESULT_CORRECTED' and before ? 'participants' and after ? 'participants'),'correction audits preserve before and after outcomes');
select is((select count(*)::int from public.adjustments where event_id='35000000-0000-0000-0000-000000000001' and reason='Ref bonus'),1,'adjustment replay inserted exactly one row');
update public.events set leaderboard_public=true where id='35000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.get_match_entry('75000000-0000-0000-0000-000000000002')$$,'P0001','FORBIDDEN','public leaderboard never opens unassigned operational entry');
select is(jsonb_array_length(public.get_referee_board('35000000-0000-0000-0000-000000000001')->'matches'),1,'public leaderboard never expands referee board beyond assigned active match');
reset role;
select ok(exists(select 1 from phase5_signals),'live writes emit broadcasts');
select ok(not exists(select 1 from phase5_signals where is_private is distinct from false),'live signals use the agreed public channel');
select ok(not exists(select 1 from phase5_signals where topic not in ('event:35000000-0000-0000-0000-000000000001','event:35000000-0000-0000-0000-000000000002')),'broadcast topics remain scoped to event ids');
select ok(not exists(select 1 from phase5_signals s cross join lateral jsonb_object_keys(s.payload) k where k not in ('type','matchId','roundId')),'broadcast payloads contain only allowed signal type and ids');
select ok(not exists(select 1 from phase5_signals where payload::text ~ '"(outcome|points|reason|name_en|given_by|participants)"[[:space:]]*:'),'broadcasts expose no result, points, names or reasons');
select ok(exists(select 1 from phase5_signals where event='round_changed') and exists(select 1 from phase5_signals where event='match_changed') and exists(select 1 from phase5_signals where event='adjustment_changed'),'all live mutation families emit their thin signal');
set local role authenticated;
select throws_ok($$select public.phase5_snapshot('35000000-0000-0000-0000-000000000001')$$,'42501',null,'client cannot bypass snapshot scope checks');
select throws_ok($$select public.phase5_match_mutation(gen_random_uuid(),'75000000-0000-0000-0000-000000000001','void_match',null,'Bypass')$$,'42501',null,'client cannot invoke internal mutation dispatcher');
select throws_ok('select * from public.match_participants','42501',null,'live operations do not grant direct result reads');
select * from finish();
rollback;
