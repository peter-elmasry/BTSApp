begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

insert into auth.users(id)
select ('13000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,system_role,is_active)
select ('23000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
       ('13000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
       'phase3_test_'||n,'+20100000000'||n,'Phase Three '||n,
       case when n=1 then 'OWNER' else 'MEMBER' end,n<>6
from generate_series(1,6) n;
insert into public.members(id,username,phone,full_name_en)
values('23000000-0000-0000-0000-000000000007','phase3_guide','+201000000007','No Login Guide');
insert into public.events(id,code,name_en) values
('33000000-0000-0000-0000-000000000001','P3-EVENT','Phase Three'),
('33000000-0000-0000-0000-000000000002','P3-OTHER','Other');
insert into public.teams(event_id,code,name_en,avatar_key,color_hex)
values('33000000-0000-0000-0000-000000000002','T99','Other Team','star','#123456');
insert into public.games(event_id,code,name_en)
values('33000000-0000-0000-0000-000000000002','G99','Other Game');
insert into public.event_roles(event_id,member_id,role) values
('33000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000002','EVENT_ADMIN'),
('33000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000003','REFEREE'),
('33000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000006','EVENT_ADMIN');

create temp table phase3_fixture(payload jsonb);
insert into phase3_fixture values('{
  "event":{"name_en":"Imported event","points_win":3,"points_draw":1,"points_loss":0,"currency_en_one":"Point","currency_en_other":"Points","currency_ar_one":"نقطة","currency_ar_two":"نقطتين","currency_ar_plural":"نقط","leaderboard_public":false},
  "teams":[{"row":3,"code":"T01","name_en":"One","avatar_key":"falcon","color_hex":"#123456"},{"row":8,"code":"T02","name_en":"Two","avatar_key":"lion","color_hex":"#654321"}],
  "games":[{"row":2,"code":"G01","name_en":"Race"},{"row":3,"code":"G02","name_en":"Puzzle"}],
  "rounds":[{"row":2,"number":0,"type":"OPENING","duration_min":10},{"row":3,"number":1,"type":"REGULAR","duration_min":20}],
  "matches":[{"row":2,"round_number":0,"game_code":"G02"},{"row":3,"round_number":1,"game_code":"G01","team_a_code":"T01","team_b_code":"T02"}],
  "staff":[{"row":2,"member":"phase3_test_3","role":"REFEREE","game_codes":"G01,G02"},{"row":3,"member":"01000000007","role":"GUIDE","team_code":"T01"}]
}');
grant select on phase3_fixture to authenticated;

set local role anon;
select throws_ok($$select public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001','{}')$$,'42501',null,'anonymous cannot import');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture))$$,'P0001','FORBIDDEN','referee cannot import');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture))$$,'P0001','FORBIDDEN','unassigned member cannot import');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture))$$,'P0001','FORBIDDEN','inactive administrator cannot import');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000002',(select payload from phase3_fixture))$$,'P0001','FORBIDDEN','administrator cannot import another event');
select throws_ok($$select public.phase3_check_record('Teams','{}')$$,'42501',null,'internal validation helper is not client callable');
select throws_ok($$select public.import_event_setup(null,'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture))$$,'P0001','INVALID_OP_ID','operation id is required');

select is(public.import_event_setup('93000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture))->>'valid','true','valid preview exercises full write path');
select is(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture))->>'applied','false','preview reports no apply');
select is(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{event,leaderboard_public}','null') from phase3_fixture))->>'valid','true','blank optional leaderboard boolean is valid during preview');
reset role;
select is((select count(*)::int from public.teams where event_id='33000000-0000-0000-0000-000000000001'),0,'preview retains no teams');
select is((select count(*)::int from public.matches where event_id='33000000-0000-0000-0000-000000000001'),0,'preview retains no matches');
select is((select count(*)::int from public.audit_log where event_id='33000000-0000-0000-0000-000000000001'),0,'preview retains no audit entries');
select is((select count(*)::int from public.client_ops where actor_id='23000000-0000-0000-0000-000000000002'),0,'preview retains no child or outer operation ids');
select is((select name_en from public.events where id='33000000-0000-0000-0000-000000000001'),'Phase Three','preview rolls event settings back');
select is((select count(*)::int from public.event_roles where event_id='33000000-0000-0000-0000-000000000001'),3,'preview rolls staff changes back');
set local role authenticated;

select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{teams,1,color_hex}','"red"') from phase3_fixture),'UPSERT',false)->'errors' @> '[{"sheet":"Teams","row":8,"column":"color_hex","code":"INVALID_FIELD"}]','bad original row is reported with exact column');
reset role;
select is((select count(*)::int from public.teams where event_id='33000000-0000-0000-0000-000000000001'),0,'one bad row rolls all successful rows back');
select is((select count(*)::int from public.audit_log where event_id='33000000-0000-0000-0000-000000000001'),0,'bad apply rolls all audits back');
select is((select count(*)::int from public.client_ops where actor_id='23000000-0000-0000-0000-000000000002'),0,'bad apply consumes no operation id');
set local role authenticated;
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001','[]')->'errors' @> '[{"code":"INVALID_PAYLOAD"}]','scalar or array payload is rejected');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload-'staff' from phase3_fixture))->'errors' @> '[{"sheet":"Staff","code":"INVALID_PAYLOAD"}]','all collection properties are required');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{teams,0}','42') from phase3_fixture))->'errors' @> '[{"sheet":"Teams","row":2,"code":"INVALID_ROW"}]','every collection item must be a record');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{event}',(payload->'event')-'points_win') from phase3_fixture))->'errors' @> '[{"sheet":"Event","column":"points_win","code":"REQUIRED_FIELD"}]','required event settings cannot be omitted');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{rounds,1,number}','1.5') from phase3_fixture))->'errors' @> '[{"sheet":"Rounds","column":"number","code":"INVALID_FIELD"}]','fractional round numbers are rejected without casting errors');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{teams,0,id}','"43000000-0000-0000-0000-000000000001"') from phase3_fixture))->'errors' @> '[{"sheet":"Teams","column":"id","code":"INVALID_FIELD"}]','client cannot provide hidden row identifiers');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{teams,1,code}','"t01"') from phase3_fixture))->'errors' @> '[{"sheet":"Teams","row":8,"code":"DUPLICATE_CODE"}]','duplicate codes compare case insensitively');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{matches,1,game_code}','"G99"') from phase3_fixture))->'errors' @> '[{"sheet":"Matches","row":3,"column":"game_code","code":"UNKNOWN_REFERENCE"}]','game references cannot resolve through another event');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{matches,1,team_a_code}','"T99"') from phase3_fixture))->'errors' @> '[{"sheet":"Matches","column":"team_a_code","code":"UNKNOWN_REFERENCE"}]','team references cannot resolve through another event');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{matches,1,team_b_code}','"T01"') from phase3_fixture))->'errors' @> '[{"sheet":"Matches","code":"INVALID_PARTICIPANTS"}]','a regular match cannot play a team against itself');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{matches}',(payload->'matches')||jsonb_build_array(payload->'matches'->1)) from phase3_fixture))->'errors' @> '[{"sheet":"Matches","code":"DUPLICATE_MATCH"}]','a round and game cannot repeat in workbook');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{matches}',(payload->'matches')||'[{"row":9,"round_number":1,"game_code":"G02","team_a_code":"T01","team_b_code":"T02"}]'::jsonb) from phase3_fixture))->'errors' @> '[{"sheet":"Matches","row":9,"code":"TEAM_ALREADY_SCHEDULED"}]','a team cannot play twice in the same round');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{matches}','[{"round_number":1,"game_code":"G01","team_a_code":"T01","team_b_code":"T02"}]') from phase3_fixture))->'errors' @> '[{"sheet":"Matches","code":"OPENING_MATCH_REQUIRED"}]','opening round must contain exactly one match');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{staff,0,member}','"phase3_test_6"') from phase3_fixture))->'errors' @> '[{"sheet":"Staff","column":"member","code":"MEMBER_NOT_ELIGIBLE"}]','inactive staff cannot be imported');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{staff,0,role}','"EVENT_ADMIN"') from phase3_fixture))->'errors' @> '[{"sheet":"Staff","column":"role","code":"INVALID_ROLE"}]','import cannot assign event administrators');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{staff,0,member}','"phase3_guide"') from phase3_fixture))->'errors' @> '[{"sheet":"Staff","code":"MEMBER_NOT_ELIGIBLE"}]','referee must have login');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{staff}',(payload->'staff')||'[{"row":10,"member":"phase3_test_4","role":"GUIDE","team_code":"T01"}]'::jsonb) from phase3_fixture))->'errors' @> '[{"sheet":"Staff","row":10,"code":"TEAM_HAS_GUIDE"}]','one guide per team is enforced across workbook rows');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(jsonb_set(payload,'{teams,1,color_hex}','"red"'),'{games,0,name_en}','42') from phase3_fixture))->'errors' @> '[{"sheet":"Teams","row":8,"column":"color_hex"},{"sheet":"Games","row":2,"column":"name_en"}]','preview collects errors on independent sheets');
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'DELETE')->'errors' @> '[{"code":"INVALID_MODE"}]','unsupported import mode is rejected');

select is(public.import_event_setup('93000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'UPSERT',false)->>'applied','true','preview operation id can subsequently apply');
reset role;
select is((select count(*)::int from public.teams where event_id='33000000-0000-0000-0000-000000000001'),2,'valid workbook builds teams');
select is((select count(*)::int from public.games where event_id='33000000-0000-0000-0000-000000000001'),2,'valid workbook builds games');
select is((select count(*)::int from public.rounds where event_id='33000000-0000-0000-0000-000000000001'),2,'valid workbook builds rounds');
select is((select count(*)::int from public.matches where event_id='33000000-0000-0000-0000-000000000001'),2,'valid workbook builds matches');
select is((select count(*)::int from public.match_participants mp join public.rounds r on r.id=mp.round_id where r.event_id='33000000-0000-0000-0000-000000000001' and r.type='OPENING'),2,'opening includes every team');
select is((select count(*)::int from public.referee_games where event_id='33000000-0000-0000-0000-000000000001'),2,'valid workbook assigns referee games');
select is((select count(*)::int from public.event_roles where event_id='33000000-0000-0000-0000-000000000001' and role='GUIDE'),1,'normalized phone identifies no-login guide');
select is((select count(*)::int from public.audit_log where event_id='33000000-0000-0000-0000-000000000001' and action='EVENT_SETUP_IMPORTED'),1,'completed import is audited');
set local role authenticated;
select is(public.import_event_setup('93000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001','{}','UPSERT',false)->>'applied','true','apply replay returns stored successful result');
reset role;
select is((select count(*)::int from public.audit_log where event_id='33000000-0000-0000-0000-000000000001' and action='EVENT_SETUP_IMPORTED'),1,'replay does not create another import audit');
update public.teams set sort_order=9 where event_id='33000000-0000-0000-0000-000000000001' and code='T01';
update public.games set image_path='33000000-0000-0000-0000-000000000001/53000000-0000-0000-0000-000000000001.webp' where event_id='33000000-0000-0000-0000-000000000001' and code='G01';
update public.events set leaderboard_public=true where id='33000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.import_event_setup('93000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'UPSERT',false)$$,'P0001','OP_ID_CONFLICT','another actor cannot replay administrator import');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
select is(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(jsonb_set(jsonb_set(payload,'{games}','[{"code":"G01","name_en":"Updated Race"}]'),'{staff,0,game_codes}','"G01"'),'{event,leaderboard_public}','null') from phase3_fixture),'UPSERT',false)->>'applied','true','upsert resolves references to existing setup');
reset role;
select is((select count(*)::int from public.games where event_id='33000000-0000-0000-0000-000000000001'),2,'upsert retains omitted game rows');
select is((select count(*)::int from public.referee_games where event_id='33000000-0000-0000-0000-000000000001'),2,'upsert retains omitted referee assignments');
select is((select sort_order from public.teams where event_id='33000000-0000-0000-0000-000000000001' and code='T01'),9,'upsert preserves manual team ordering outside template columns');
select is((select image_path from public.games where event_id='33000000-0000-0000-0000-000000000001' and code='G01'),'33000000-0000-0000-0000-000000000001/53000000-0000-0000-0000-000000000001.webp','upsert preserves UI-managed images');
select is((select leaderboard_public from public.events where id='33000000-0000-0000-0000-000000000001'),true,'blank optional leaderboard boolean preserves existing value on apply');
insert into public.event_roles(event_id,member_id,role,team_id)
select '33000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000004','GUIDE',id
from public.teams where event_id='33000000-0000-0000-0000-000000000001' and code='T02';
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture))$$,'P0001','FORBIDDEN','guide has no import permissions');
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
select is(public.import_event_setup('93000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000002',(select payload from phase3_fixture),'REPLACE',false)->>'applied','true','owner can replace draft event');
select throws_ok($$select public.import_event_setup('93000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'UPSERT',false)$$,'P0001','OP_ID_CONFLICT','operation ids are bound to event as well as actor');
reset role;
select is((select count(*)::int from public.games where event_id='33000000-0000-0000-0000-000000000002' and code='G99'),0,'replace removes omitted setup rows');
create temp table phase3_before_replace as select jsonb_agg(to_jsonb(t) order by code) snapshot from public.teams t where event_id='33000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
select is(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'REPLACE')->>'valid','true','replace preview validates against replacement data');
select is(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select jsonb_set(payload,'{teams,1,color_hex}','"bad"') from phase3_fixture),'REPLACE',false)->>'applied','false','bad replace applies nothing');
reset role;
select is((select jsonb_agg(to_jsonb(t) order by code) from public.teams t where event_id='33000000-0000-0000-0000-000000000001'),(select snapshot from phase3_before_replace),'replace preview and failed replacement preserve original team identities');
select is((select count(*)::int from public.event_roles where event_id='33000000-0000-0000-0000-000000000001' and role='GUIDE'),2,'failed replacement restores previous staff assignments');
set local role authenticated;
select is(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'REPLACE',false)->>'applied','true','administrator can replace draft event');
reset role;
select is((select count(*)::int from public.event_roles where event_id='33000000-0000-0000-0000-000000000001' and role='EVENT_ADMIN'),2,'replace preserves event administrator roles');
update public.rounds set started_at=now() where event_id='33000000-0000-0000-0000-000000000001' and number=1;
set local role authenticated;
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'REPLACE',false)->'errors' @> '[{"code":"REPLACE_NOT_ALLOWED"}]','replace rejects even a draft round that started before');
reset role;
update public.rounds set started_at=null where event_id='33000000-0000-0000-0000-000000000001';
update public.events set status='LIVE' where id='33000000-0000-0000-0000-000000000001';
set local role authenticated;
select ok(public.import_event_setup(gen_random_uuid(),'33000000-0000-0000-0000-000000000001',(select payload from phase3_fixture),'REPLACE')->'errors' @> '[{"code":"REPLACE_NOT_ALLOWED"}]','replace requires draft event');
select * from finish();
rollback;
