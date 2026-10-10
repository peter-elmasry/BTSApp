begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Exercise RPCs with client roles; only the privileged runner prepares fixtures.
insert into auth.users(id)
select ('14000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,7) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,full_name_ar,system_role,is_active)
select ('24000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('14000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'private_phase4_'||n,'+20111111111'||n,'Public Name '||n,'اسم '||n,
  case when n=1 then 'OWNER' else 'MEMBER' end,n<>6
from generate_series(1,7) n;
update public.events set is_current=false where is_current;
insert into public.events(id,code,name_en,name_ar,created_by,match_bonus_cap) values
('34000000-0000-0000-0000-000000000001','P4-EVENT','Public Event','الحدث','24000000-0000-0000-0000-000000000001',99),
('34000000-0000-0000-0000-000000000002','P4-OTHER','Other Event',null,'24000000-0000-0000-0000-000000000001',88);
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex,sort_order,final_tiebreak_pos) values
('44000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','T01','Falcons','falcon','#123456',2,9),
('44000000-0000-0000-0000-000000000002','34000000-0000-0000-0000-000000000001','T02','Lions','lion','#654321',1,8),
('44000000-0000-0000-0000-000000000003','34000000-0000-0000-0000-000000000001','T03','Stars','star','#112233',3,7),
('44000000-0000-0000-0000-000000000098','34000000-0000-0000-0000-000000000002','T02','Other Lions','lion','#654321',1,null),
('44000000-0000-0000-0000-000000000099','34000000-0000-0000-0000-000000000002','T01','Other Falcons','falcon','#123456',2,null);
insert into public.games(id,event_id,code,name_en,location_en,image_path) values
('54000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','G01','Race','Field','34000000-0000-0000-0000-000000000001/54000000-0000-0000-0000-000000000001.webp'),
('54000000-0000-0000-0000-000000000002','34000000-0000-0000-0000-000000000001','G02','Puzzle','Hall',null),
('54000000-0000-0000-0000-000000000099','34000000-0000-0000-0000-000000000002','G99','Other Race','Other Field',null);
insert into public.rounds(id,event_id,number,type,duration_min,extension_min,status,started_at,closed_at) values
('64000000-0000-0000-0000-000000000000','34000000-0000-0000-0000-000000000001',0,'OPENING',10,0,'CLOSED',now()-interval '3 hours',now()-interval '2 hours'),
('64000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001',1,'REGULAR',10,5,'ACTIVE',now()-interval '30 minutes',null),
('64000000-0000-0000-0000-000000000002','34000000-0000-0000-0000-000000000001',2,'REGULAR',20,0,'DRAFT',null,null),
('64000000-0000-0000-0000-000000000003','34000000-0000-0000-0000-000000000001',3,'REGULAR',10,0,'CLOSED',now()-interval '1 hour',now()-interval '20 minutes'),
('64000000-0000-0000-0000-000000000099','34000000-0000-0000-0000-000000000002',1,'REGULAR',10,0,'CLOSED',now()-interval '1 hour',now()-interval '20 minutes');
insert into public.matches(id,event_id,round_id,game_id,status,result_entered_by,result_entered_at,void_reason) values
('74000000-0000-0000-0000-000000000000','34000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000000','54000000-0000-0000-0000-000000000002','COMPLETED','24000000-0000-0000-0000-000000000003',now(),'Private internal reason'),
('74000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000001','COMPLETED','24000000-0000-0000-0000-000000000003',now(),null),
('74000000-0000-0000-0000-000000000003','34000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','54000000-0000-0000-0000-000000000002','COMPLETED','24000000-0000-0000-0000-000000000003',now(),null),
('74000000-0000-0000-0000-000000000099','34000000-0000-0000-0000-000000000002','64000000-0000-0000-0000-000000000099','54000000-0000-0000-0000-000000000099','COMPLETED','24000000-0000-0000-0000-000000000001',now(),null);
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values
('74000000-0000-0000-0000-000000000000','64000000-0000-0000-0000-000000000000','44000000-0000-0000-0000-000000000001',null,'WIN'),
('74000000-0000-0000-0000-000000000000','64000000-0000-0000-0000-000000000000','44000000-0000-0000-0000-000000000002',null,'LOSS'),
('74000000-0000-0000-0000-000000000000','64000000-0000-0000-0000-000000000000','44000000-0000-0000-0000-000000000003',null,'WIN'),
('74000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','A','WIN'),
('74000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000002','B','LOSS'),
('74000000-0000-0000-0000-000000000003','64000000-0000-0000-0000-000000000003','44000000-0000-0000-0000-000000000001','A','DRAW'),
('74000000-0000-0000-0000-000000000003','64000000-0000-0000-0000-000000000003','44000000-0000-0000-0000-000000000003','B','DRAW'),
('74000000-0000-0000-0000-000000000099','64000000-0000-0000-0000-000000000099','44000000-0000-0000-0000-000000000099','A','WIN'),
('74000000-0000-0000-0000-000000000099','64000000-0000-0000-0000-000000000099','44000000-0000-0000-0000-000000000098','B','LOSS');
insert into public.event_roles(event_id,member_id,role,team_id) values
('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002','EVENT_ADMIN',null),
('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000003','REFEREE',null),
('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000004','GUIDE','44000000-0000-0000-0000-000000000001'),
('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000006','EVENT_ADMIN',null),
('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000006','GUIDE','44000000-0000-0000-0000-000000000003'),
('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000007','REFEREE',null);
insert into public.referee_games(event_id,member_id,game_id) values
('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000003','54000000-0000-0000-0000-000000000001');
insert into public.adjustments(id,event_id,scope,match_id,team_id,points,reason,given_by,revoked_at,revoked_by,revoke_reason) values
('84000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','EVENT',null,'44000000-0000-0000-0000-000000000001',5,'Team bonus','24000000-0000-0000-0000-000000000001',null,null,null),
('84000000-0000-0000-0000-000000000002','34000000-0000-0000-0000-000000000001','MATCH','74000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001',-2,'Match penalty','24000000-0000-0000-0000-000000000003',null,null,null),
('84000000-0000-0000-0000-000000000003','34000000-0000-0000-0000-000000000001','EVENT',null,'44000000-0000-0000-0000-000000000002',9,'Other team bonus','24000000-0000-0000-0000-000000000001',null,null,null),
('84000000-0000-0000-0000-000000000004','34000000-0000-0000-0000-000000000001','EVENT',null,'44000000-0000-0000-0000-000000000001',3,'Revoked bonus','24000000-0000-0000-0000-000000000001',now(),'24000000-0000-0000-0000-000000000001','Incorrect bonus'),
('84000000-0000-0000-0000-000000000099','34000000-0000-0000-0000-000000000002','EVENT',null,'44000000-0000-0000-0000-000000000099',11,'Other event bonus','24000000-0000-0000-0000-000000000001',null,null,null);

set local role anon;
select is(public.get_current_event(),null::jsonb,'no current event returns null');
reset role;
update public.events set is_current=true where id='34000000-0000-0000-0000-000000000001';
set local role anon;
select is(public.get_current_event()->>'code','P4-EVENT','anonymous receives current event');
select ok(not exists(select 1 from jsonb_object_keys(public.get_current_event()) k where k not in ('id','code','name_en','name_ar','status','starts_on','leaderboard_public','show_guide_phone','points_win','points_draw','points_loss','currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural')),'event response uses the public field allowlist');
select ok(not (public.get_current_event() ?| array['created_by','created_at','updated_at','match_bonus_cap','event_penalty_cap']),'event excludes internal metadata and adjustment caps');
select is(jsonb_array_length(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'),3,'bootstrap contains only requested event teams');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'->0->>'code','T02','teams follow manual ordering');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'->1->'guide'->>'name_en','Public Name 4','guide uses localized public name aliases');
select ok(not (public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'->1->'guide' ? 'phone'),'guide phone key is absent when flag is off');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'->0->'guide','null'::jsonb,'unassigned guide is null');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'->2->'guide','null'::jsonb,'inactive guide is omitted');
select ok(public.get_bootstrap('34000000-0000-0000-0000-000000000001')::text !~ '"(username|auth_user_id|member_id|created_by|final_tiebreak_pos|outcome)"[[:space:]]*:','bootstrap exposes no member identifiers, tie positions or outcomes');
select is(jsonb_array_length(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'games'),2,'bootstrap games stay within event');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'games'->0->>'location_en','Field','game location is public');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'games'->0->>'image_path','34000000-0000-0000-0000-000000000001/54000000-0000-0000-0000-000000000001.webp','game image path is public');
select is(jsonb_array_length(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'rounds'),4,'bootstrap rounds stay within event');
select is((public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'rounds'->1->>'ends_at')::timestamptz,now()-interval '15 minutes','round end includes extensions');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'rounds'->1->>'is_overtime','true','active round past server deadline is overtime');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'rounds'->0->>'is_overtime','false','closed opening round is not overtime');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'rounds'->2->'ends_at','null'::jsonb,'unstarted round has no deadline');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'rounds'->2->>'is_overtime','false','unstarted round is not overtime');
select is(jsonb_array_length(public.get_schedule('34000000-0000-0000-0000-000000000001')),3,'schedule includes only requested event matches');
select is(public.get_schedule('34000000-0000-0000-0000-000000000001')->0->>'id','74000000-0000-0000-0000-000000000000','schedule is ordered by round then game');
select is(jsonb_array_length(public.get_schedule('34000000-0000-0000-0000-000000000001')->0->'participants'),3,'opening schedule includes all participants');
select ok(not exists(select 1 from jsonb_array_elements(public.get_schedule('34000000-0000-0000-0000-000000000001')) m cross join lateral jsonb_array_elements(m->'participants') p where p ? 'outcome'),'anonymous hidden schedule has no outcome keys');
select ok(public.get_schedule('34000000-0000-0000-0000-000000000001')::text !~ '"(result_entered_by|result_entered_at|void_reason|event_id|points)"[[:space:]]*:','schedule excludes protected match metadata and scores');
select is(public.get_team_view('34000000-0000-0000-0000-000000000001',' t01 ')->'team'->>'name_en','Falcons','team lookup normalizes code');
select is(jsonb_array_length(public.get_team_view('34000000-0000-0000-0000-000000000001','T02')->'matches'),2,'team view excludes matches it does not play');
select ok(not exists(select 1 from jsonb_array_elements(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'matches') m cross join lateral jsonb_array_elements(m->'participants') p where p->>'team_code'='T01' and not p ? 'outcome'),'requested team always receives its own outcomes');
select ok(not exists(select 1 from jsonb_array_elements(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'matches') m cross join lateral jsonb_array_elements(m->'participants') p where p->>'team_code'<>'T01' and p ? 'outcome'),'hidden team view omits every opponent outcome including opening winners');
select is(jsonb_array_length(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'adjustments'),2,'team receives only its nonrevoked adjustments');
select ok(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'adjustments' @> '[{"points":5,"reason":"Team bonus","given_by":{"name_en":"Public Name 1"}},{"points":-2,"reason":"Match penalty"}]','own adjustments include reason, giver name and points');
select ok(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')::text !~ '"(username|auth_user_id|member_id|revoked_at|revoked_by|revoke_reason)"[[:space:]]*:','team response omits account and revoked-adjustment metadata');
select is(jsonb_array_length(public.get_team_view('34000000-0000-0000-0000-000000000001','T03')->'adjustments'),0,'no adjustments returns an empty list');
select throws_ok($$select public.get_bootstrap('34000000-0000-0000-0000-000000000999')$$,'P0001','NOT_FOUND','missing bootstrap event is rejected');
select throws_ok($$select public.get_schedule('34000000-0000-0000-0000-000000000999')$$,'P0001','NOT_FOUND','missing schedule event is rejected');
select throws_ok($$select public.get_team_view('34000000-0000-0000-0000-000000000999','T01')$$,'P0001','NOT_FOUND','missing team-view event is rejected');
select throws_ok($$select public.get_team_view('34000000-0000-0000-0000-000000000001','T99')$$,'P0001','NOT_FOUND','missing team code is rejected');
select throws_ok($$select public.phase4_event_json('34000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot invoke internal event builder');
select throws_ok($$select public.phase4_matches_json('34000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot invoke internal visibility builder');
select throws_ok('select * from public.match_participants','42501',null,'public RPCs do not grant participant table reads');
select throws_ok('select * from public.members','42501',null,'public RPCs do not grant member table reads');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
select ok(public.get_schedule('34000000-0000-0000-0000-000000000001')->0->'participants'->0 ? 'outcome','owner can see hidden schedule outcomes');
select ok(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'matches'->0->'participants'->0 ? 'outcome','owner can see hidden opponent outcomes');
select ok(public.get_schedule('34000000-0000-0000-0000-000000000002')->0->'participants'->0 ? 'outcome','owner sees outcomes in every event');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000002',true);
select ok(public.get_schedule('34000000-0000-0000-0000-000000000001')->1->'participants'->0 ? 'outcome','event admin can see hidden schedule outcomes');
select ok(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'matches'->0->'participants'->0 ? 'outcome','event admin can see hidden opponent outcomes');
select ok(not (public.get_schedule('34000000-0000-0000-0000-000000000002')->0->'participants'->0 ? 'outcome'),'admin role never grants hidden outcomes across events');
select is(public.get_team_view('34000000-0000-0000-0000-000000000002','T01')->'team'->>'name_en','Other Falcons','same code in another event resolves its own team');
select is(jsonb_array_length(public.get_team_view('34000000-0000-0000-0000-000000000002','T01')->'adjustments'),1,'adjustments remain scoped to team and event');
select ok(not (public.get_team_view('34000000-0000-0000-0000-000000000002','T01')->'matches'->0->'participants'->1 ? 'outcome'),'cross-event team view still hides opponents');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000003',true);
select ok(not (public.get_schedule('34000000-0000-0000-0000-000000000001')->1->'participants'->0 ? 'outcome'),'assigned referee cannot see hidden schedule outcomes');
select ok(not (public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'matches'->0->'participants'->0 ? 'outcome'),'assigned referee cannot see hidden opponents');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000007',true);
select ok(not (public.get_schedule('34000000-0000-0000-0000-000000000001')->1->'participants'->0 ? 'outcome'),'unassigned referee cannot see hidden schedule outcomes');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000004',true);
select ok(not (public.get_schedule('34000000-0000-0000-0000-000000000001')->1->'participants'->0 ? 'outcome'),'guide cannot see hidden schedule outcomes');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000005',true);
select ok(not (public.get_schedule('34000000-0000-0000-0000-000000000001')->1->'participants'->0 ? 'outcome'),'unassigned member cannot see hidden schedule outcomes');
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000006',true);
select ok(not (public.get_schedule('34000000-0000-0000-0000-000000000001')->1->'participants'->0 ? 'outcome'),'inactive admin immediately loses hidden outcome access');
select ok(not (public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'matches'->0->'participants'->0 ? 'outcome'),'inactive admin cannot see hidden opponents');
select throws_ok($$select public.phase4_team_json('44000000-0000-0000-0000-000000000001')$$,'42501',null,'authenticated cannot invoke internal team builder');
select throws_ok('select * from public.adjustments','42501',null,'authenticated cannot bypass team-scoped adjustment reads');

reset role;
update public.events set show_guide_phone=true,leaderboard_public=true where id='34000000-0000-0000-0000-000000000001';
update public.rounds set started_at=now() where id='64000000-0000-0000-0000-000000000001';
set local role anon;
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'->1->'guide'->>'phone','+201111111114','guide phone is public only after event enables it');
select is(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'team'->'guide'->>'phone','+201111111114','team view applies the same guide-phone rule');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'teams'->2->'guide','null'::jsonb,'phone flag never exposes inactive guides');
select is(public.get_bootstrap('34000000-0000-0000-0000-000000000001')->'rounds'->1->>'is_overtime','false','active round before deadline is not overtime');
select ok(not exists(select 1 from jsonb_array_elements(public.get_schedule('34000000-0000-0000-0000-000000000001')) m cross join lateral jsonb_array_elements(m->'participants') p where not p ? 'outcome'),'public leaderboard permits all schedule outcome keys');
select ok(public.get_team_view('34000000-0000-0000-0000-000000000001','T01')->'matches'->0->'participants'->0 ? 'outcome','public leaderboard permits opponent outcomes');
select ok(not (public.get_schedule('34000000-0000-0000-0000-000000000002')->0->'participants'->0 ? 'outcome'),'public flag never opens another event outcomes');
set local role authenticated;
select set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000006',true);
select ok(public.get_schedule('34000000-0000-0000-0000-000000000001')->0->'participants'->0 ? 'outcome','inactive account retains the same public reads as anonymous');
reset role;
select ok(not has_table_privilege(r,'public.'||t,'SELECT'),r||' still cannot read '||t)
from unnest(array['anon','authenticated']) r cross join unnest(array['events','teams','games','rounds','matches','match_participants','members','event_roles','adjustments']) t;
select is((select count(*)::int from public.audit_log where event_id in ('34000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000002')),0,'public reads create no audit records');
select is((select count(*)::int from public.client_ops where actor_id in (select id from public.members where username::text like 'private_phase4_%')),0,'public reads consume no operation ids');
select * from finish();
rollback;
