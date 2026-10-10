begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id)
select ('12000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role,is_active)
select ('22000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('12000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'phase2_test_'||n,'Phase Two Test '||n,case when n=1 then 'OWNER' else 'MEMBER' end,true
from generate_series(1,5) n;
insert into public.members(id,username,full_name_en,system_role,is_active)
values('22000000-0000-0000-0000-000000000006','phase2_guide','No Login Guide','MEMBER',true);
insert into public.events(id,code,name_en)
values('32000000-0000-0000-0000-000000000001','P2-EVENT','Phase Two Event'),
      ('32000000-0000-0000-0000-000000000002','P2-OTHER','Other Event');
insert into public.games(id,event_id,code,name_en)
values('52000000-0000-0000-0000-000000000099','32000000-0000-0000-0000-000000000002','G01','Other event game');
insert into public.event_roles(event_id,member_id,role) values
 ('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000002','EVENT_ADMIN'),
 ('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000005','EVENT_ADMIN'),
 ('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000003','REFEREE');

set local role anon;
select throws_ok($$select public.get_event_setup('32000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot read setup');
select throws_ok($$select public.upsert_team('92000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','{}')$$,'42501',null,'anonymous cannot write setup');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.get_event_setup('32000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee cannot read setup');
select throws_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000001','{"points_win":3}')$$,'P0001','FORBIDDEN','referee cannot update settings');
select throws_ok($$select public.upsert_team('92000000-0000-0000-0000-000000000003','32000000-0000-0000-0000-000000000001','{"code":"T01","name_en":"No","avatar_key":"falcon","color_hex":"#112233"}')$$,'P0001','FORBIDDEN','referee cannot create teams');
select throws_ok($$insert into storage.objects(bucket_id,name) values('game-images','32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000004.webp')$$,'42501',null,'referee cannot upload game images');

select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(public.get_event_setup('32000000-0000-0000-0000-000000000001')->'eligible_members'),6,'event admin receives active member directory');
select ok((public.get_event_setup('32000000-0000-0000-0000-000000000001')->'eligible_members' @> '[{"id":"22000000-0000-0000-0000-000000000006","has_login":false}]'::jsonb),'directory includes no-login guide without auth data');
select ok(not ((public.get_event_setup('32000000-0000-0000-0000-000000000001')->'eligible_members'->0) ? 'phone'),'directory excludes phone numbers');

select lives_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000010','32000000-0000-0000-0000-000000000001','{"name_en":"Updated Event","name_ar":"الحدث","points_win":3,"leaderboard_public":true}')$$,'event admin can update names and settings');
select is((select name_en from public.events where id='32000000-0000-0000-0000-000000000001'),'Updated Event','event English name is updated');
select is((select name_ar from public.events where id='32000000-0000-0000-0000-000000000001'),'الحدث','event Arabic name is updated');
select is((select points_win from public.events where id='32000000-0000-0000-0000-000000000001'),3,'settings update is applied');
select is((select count(*)::int from public.audit_log where event_id='32000000-0000-0000-0000-000000000001' and action='EVENT_SETTINGS_UPDATED'),1,'settings mutation is audited once');
select is(public.upsert_event_settings('92000000-0000-0000-0000-000000000010','32000000-0000-0000-0000-000000000001','{"points_win":1}')->'settings'->>'points_win','3','same op id returns stored result');
select is((select count(*)::int from public.audit_log where event_id='32000000-0000-0000-0000-000000000001' and action='EVENT_SETTINGS_UPDATED'),1,'settings replay does not repeat audit');
reset role;
select ok((select public and file_size_limit=5242880 and allowed_mime_types=array['image/webp'] from storage.buckets where id='game-images'),'game image bucket is public WebP with a 5 MiB limit');
set local role authenticated;
select lives_ok($$insert into storage.objects(bucket_id,name) values('game-images','32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000001.webp')$$,'event admin can upload to own event folder');
select lives_ok($$insert into storage.objects(bucket_id,name) values('game-images','32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000005.webp')$$,'event admin can upload another event image');
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
select lives_ok($$delete from storage.objects where bucket_id='game-images' and name='32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000005.webp'$$,'referee delete request is safely filtered');
select is((select count(*)::int from storage.objects where bucket_id='game-images' and name='32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000005.webp'),1,'referee cannot delete event image');
select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
select lives_ok($$update storage.objects set metadata='{"mimetype":"image/webp"}'::jsonb where bucket_id='game-images' and name='32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000001.webp'$$,'event admin can update own event image');
select throws_ok($$insert into storage.objects(bucket_id,name) values('game-images','32000000-0000-0000-0000-000000000002/42000000-0000-0000-0000-000000000002.webp')$$,'42501',null,'event admin cannot upload to another event folder');
select throws_ok($$update storage.objects set name='32000000-0000-0000-0000-000000000002/42000000-0000-0000-0000-000000000003.webp' where bucket_id='game-images' and name='32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000001.webp'$$,'42501',null,'event admin cannot move an image into another event folder');
select lives_ok($$delete from storage.objects where bucket_id='game-images' and name='32000000-0000-0000-0000-000000000001/42000000-0000-0000-0000-000000000001.webp'$$,'event admin can delete own event image');
select throws_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000001','{"status":"LIVE"}')$$,'P0001','INVALID_SETTINGS','settings reject unsupported fields');
select throws_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000012','32000000-0000-0000-0000-000000000001','{"name_en":"   "}')$$,'P0001','INVALID_SETTINGS','English event name cannot be blank');
select throws_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000013','32000000-0000-0000-0000-000000000001',jsonb_build_object('name_en',repeat('x',121)))$$,'P0001','INVALID_SETTINGS','English event name length is bounded');
select throws_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000014','32000000-0000-0000-0000-000000000001',jsonb_build_object('name_ar',repeat('ا',121)))$$,'P0001','INVALID_SETTINGS','Arabic event name length is bounded');

select is(public.upsert_team('92000000-0000-0000-0000-000000000020','32000000-0000-0000-0000-000000000001','{"code":"T01","name_en":"Falcons","name_ar":"الصقور","avatar_key":"falcon","color_hex":"#087f8c"}')->>'code','T01','event admin can add a team');
select is(public.upsert_team('92000000-0000-0000-0000-000000000020','32000000-0000-0000-0000-000000000001','{"code":"T02","name_en":"Lions","avatar_key":"lion","color_hex":"#123456"}')->>'code','T01','team replay returns original result');
select throws_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000020','32000000-0000-0000-0000-000000000001','{"points_win":5}')$$,'P0001','OP_ID_CONFLICT','operation id cannot be reused for a different RPC');
select is(public.upsert_team('92000000-0000-0000-0000-000000000021','32000000-0000-0000-0000-000000000001','{"code":"T02","name_en":"Lions","avatar_key":"lion","color_hex":"#123456"}')->>'code','T02','second team can be added');
select is(public.upsert_team('92000000-0000-0000-0000-000000000022','32000000-0000-0000-0000-000000000001','{"code":"T03","name_en":"Owls","avatar_key":"owl","color_hex":"#654321"}')->>'code','T03','third team can be added');
select throws_ok($$select public.upsert_team('92000000-0000-0000-0000-000000000023','32000000-0000-0000-0000-000000000001','{"code":"T04","name_en":"Bad","avatar_key":"falcon","color_hex":"red"}')$$,'P0001','INVALID_TEAM','invalid team color rejected');

select is(public.upsert_game('92000000-0000-0000-0000-000000000030','32000000-0000-0000-0000-000000000001','{"code":"G01","name_en":"Race"}')->>'code','G01','event admin can add a game');
select is(public.upsert_game('92000000-0000-0000-0000-000000000031','32000000-0000-0000-0000-000000000001','{"code":"G02","name_en":"Puzzle"}')->>'code','G02','second game can be added');
select is(public.upsert_round('92000000-0000-0000-0000-000000000040','32000000-0000-0000-0000-000000000001','{"number":1,"type":"REGULAR","name_en":"Round 1","duration_min":20}')->>'number','1','event admin can add regular round');
select is(public.upsert_round('92000000-0000-0000-0000-000000000041','32000000-0000-0000-0000-000000000001','{"number":0,"type":"OPENING","name_en":"Opening","duration_min":10}')->>'type','OPENING','valid opening round accepted');
select throws_ok($$select public.upsert_round('92000000-0000-0000-0000-000000000042','32000000-0000-0000-0000-000000000001','{"number":2,"type":"OPENING","duration_min":10}')$$,'P0001','INVALID_ROUND','opening round must be round zero');

select is(jsonb_array_length(public.upsert_match('92000000-0000-0000-0000-000000000050',(select id from public.rounds where event_id='32000000-0000-0000-0000-000000000001' and number=1),(select id from public.games where event_id='32000000-0000-0000-0000-000000000001' and code='G01'),array['T01','T02'])->'participants'),2,'admin can build a regular match with two teams');
select throws_ok($$insert into public.matches(id,event_id,round_id,game_id) values('72000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001',(select id from public.rounds where event_id='32000000-0000-0000-0000-000000000001' and number=1),(select id from public.games where event_id='32000000-0000-0000-0000-000000000001' and code='G01'))$$,'23505',null,'database enforces one match per game per round');
select throws_ok($$select public.upsert_match('92000000-0000-0000-0000-000000000051',(select id from public.rounds where event_id='32000000-0000-0000-0000-000000000001' and number=1),(select id from public.games where event_id='32000000-0000-0000-0000-000000000001' and code='G02'),array['T01','T03'])$$,'P0001','TEAM_ALREADY_SCHEDULED','team cannot be scheduled twice in one round');
select throws_ok($$select public.upsert_match('92000000-0000-0000-0000-000000000052',(select id from public.rounds where event_id='32000000-0000-0000-0000-000000000001' and number=1),(select id from public.games where event_id='32000000-0000-0000-0000-000000000002' and code='G01'),array['T01','T02'])$$,'P0001','EVENT_MISMATCH','cross-event game rejected');

select is(jsonb_array_length(public.generate_opening_match('92000000-0000-0000-0000-000000000060',(select id from public.rounds where event_id='32000000-0000-0000-0000-000000000001' and type='OPENING'),(select id from public.games where event_id='32000000-0000-0000-0000-000000000001' and code='G02'))->'participants'),3,'opening generation assigns every event team');
select is((select count(*)::int from public.match_participants mp join public.rounds r on r.id=mp.round_id where r.type='OPENING' and r.event_id='32000000-0000-0000-0000-000000000001'),3,'opening participants are unique');
select is(jsonb_array_length(public.generate_opening_match('92000000-0000-0000-0000-000000000060',(select id from public.rounds where event_id='32000000-0000-0000-0000-000000000001' and type='OPENING'),(select id from public.games where event_id='32000000-0000-0000-0000-000000000001' and code='G01'))->'participants'),3,'opening generation replay is idempotent');
select throws_ok($$select public.upsert_team('92000000-0000-0000-0000-000000000061','32000000-0000-0000-0000-000000000001','{"code":"T04","name_en":"Late Team","avatar_key":"star","color_hex":"#654321"}')$$,'P0001','OPENING_MATCH_EXISTS','team cannot be added after opening match generation');

select lives_ok($$select public.set_event_role('92000000-0000-0000-0000-000000000070','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000004','REFEREE')$$,'event admin can assign referee');
select lives_ok($$select public.set_referee_games('92000000-0000-0000-0000-000000000071','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000004',array[(select id from public.games where event_id='32000000-0000-0000-0000-000000000001' and code='G01')])$$,'event admin can assign referee games');
select lives_ok($$select public.set_event_role('92000000-0000-0000-0000-000000000072','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000006','GUIDE',(select id from public.teams where event_id='32000000-0000-0000-0000-000000000001' and code='T01'))$$,'event admin can assign guide without login');
select throws_ok($$select public.set_event_role('92000000-0000-0000-0000-000000000073','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000005','GUIDE',(select id from public.teams where event_id='32000000-0000-0000-0000-000000000001' and code='T01'))$$,'P0001','TEAM_HAS_GUIDE','second guide for same team rejected');
select throws_ok($$select public.set_event_role('92000000-0000-0000-0000-000000000075','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000005','EVENT_ADMIN')$$,'P0001','FORBIDDEN','event admin cannot grant event-admin role');
select throws_ok($$select public.remove_event_role('92000000-0000-0000-0000-000000000076','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000005','EVENT_ADMIN')$$,'P0001','FORBIDDEN','event admin cannot remove event-admin role');
select throws_ok($$select public.set_referee_games('92000000-0000-0000-0000-000000000074','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000004',array[(select id from public.games where event_id='32000000-0000-0000-0000-000000000002' limit 1)])$$,'P0001','INVALID_GAMES','cross-event referee assignment rejected');

select set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
select is(public.get_event_setup('32000000-0000-0000-0000-000000000001')->'event'->>'code','P2-EVENT','owner can read event setup');
select lives_ok($$select public.upsert_event_settings('92000000-0000-0000-0000-000000000080','32000000-0000-0000-0000-000000000001','{"points_draw":2}')$$,'owner can update event settings');
select lives_ok($$select public.set_event_role('92000000-0000-0000-0000-000000000081','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000005','EVENT_ADMIN')$$,'owner can assign event admin role');
select lives_ok($$select public.remove_event_role('92000000-0000-0000-0000-000000000082','32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000005','EVENT_ADMIN')$$,'owner can remove event admin role');
select throws_ok($$insert into public.teams(event_id,code,name_en,avatar_key,color_hex) values('32000000-0000-0000-0000-000000000001','T99','Direct write','falcon','#123456')$$,'42501',null,'authenticated cannot write domain tables directly');

select * from finish();
rollback;
