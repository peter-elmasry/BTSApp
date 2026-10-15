begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

insert into auth.users(id) select ('1d000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role,is_active)
select ('2d000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
('1d000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'picture_test_'||n,'Picture Test '||n,
case when n=1 then 'OWNER' else 'MEMBER' end,true from generate_series(1,3) n;
insert into public.events(id,code,name_en) values
('3d000000-0000-0000-0000-000000000001','PIC-ONE','Pictures'),
('3d000000-0000-0000-0000-000000000002','PIC-TWO','Other');
insert into public.event_roles(event_id,member_id,role) values
('3d000000-0000-0000-0000-000000000001','2d000000-0000-0000-0000-000000000002','EVENT_ADMIN'),
('3d000000-0000-0000-0000-000000000001','2d000000-0000-0000-0000-000000000003','REFEREE');
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
('4d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001','T01','Pictures','falcon','#123456');

set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-0000-0000-000000000002',true);
select lives_ok($$insert into storage.objects(bucket_id,name) values('team-images','3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000001.webp')$$,'admin uploads in own event');
select throws_ok($$insert into storage.objects(bucket_id,name) values('team-images','3d000000-0000-0000-0000-000000000002/5d000000-0000-0000-0000-000000000001.webp')$$,'42501',null,'admin cannot upload to another event');
select throws_ok($$insert into storage.objects(bucket_id,name) values('team-images','3d000000-0000-0000-0000-000000000001/unsafe.svg')$$,'42501',null,'non-WebP and malformed paths rejected');
select lives_ok($$select public.upsert_team('9d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001','{"id":"4d000000-0000-0000-0000-000000000001","code":"T01","name_en":"Pictures","avatar_key":"falcon","color_hex":"#123456","image_path":"3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000001.webp"}')$$,'admin sets team picture');
select lives_ok($$select public.upsert_team('9d000000-0000-0000-0000-000000000002','3d000000-0000-0000-0000-000000000001','{"id":"4d000000-0000-0000-0000-000000000001","code":"T01","name_en":"Renamed","avatar_key":"lion","color_hex":"#123456"}')$$,'workbook-style metadata update omits image');
select is(public.get_event_setup('3d000000-0000-0000-0000-000000000001')->'teams'->0->>'image_path','3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000001.webp','omitted image preserves picture');
select is(public.import_event_setup('9d000000-0000-0000-0000-000000000006','3d000000-0000-0000-0000-000000000001','{"event":{"name_en":"Pictures","points_win":2,"points_draw":1,"points_loss":0,"currency_en_one":"Point","currency_en_other":"Points","currency_ar_one":"نقطة","currency_ar_two":"نقطتين","currency_ar_plural":"نقط"},"teams":[{"code":"T01","name_en":"Renamed","avatar_key":"lion","color_hex":"#123456"}],"games":[],"rounds":[],"matches":[],"staff":[]}', 'UPSERT',false)->'applied','true'::jsonb,'real workbook UPSERT applies');
select is(public.get_event_setup('3d000000-0000-0000-0000-000000000001')->'teams'->0->>'image_path','3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000001.webp','workbook UPSERT preserves picture');
select throws_ok($$select public.upsert_team('9d000000-0000-0000-0000-000000000003','3d000000-0000-0000-0000-000000000001','{"id":"4d000000-0000-0000-0000-000000000001","code":"T01","name_en":"Pictures","avatar_key":"falcon","color_hex":"#123456","image_path":"3d000000-0000-0000-0000-000000000002/5d000000-0000-0000-0000-000000000001.webp"}')$$,'P0001','INVALID_TEAM','cross-event metadata rejected');

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is(public.get_bootstrap('3d000000-0000-0000-0000-000000000001')->'teams'->0->>'image_path','3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000001.webp','anonymous bootstrap exposes team picture');
select is((select count(*)::int from storage.objects where bucket_id='team-images' and name='3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000001.webp'),1,'anonymous can read picture object');
select throws_ok($$insert into storage.objects(bucket_id,name) values('team-images','3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000002.webp')$$,'42501',null,'anonymous cannot upload');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-0000-0000-000000000003',true);
select throws_ok($$insert into storage.objects(bucket_id,name) values('team-images','3d000000-0000-0000-0000-000000000001/5d000000-0000-0000-0000-000000000002.webp')$$,'42501',null,'referee cannot upload');
select throws_ok($$select public.upsert_team('9d000000-0000-0000-0000-000000000004','3d000000-0000-0000-0000-000000000001','{}')$$,'P0001','FORBIDDEN','referee cannot change picture metadata');
select set_config('request.jwt.claim.sub','1d000000-0000-0000-0000-000000000001',true);
select lives_ok($$insert into storage.objects(bucket_id,name) values('team-images','3d000000-0000-0000-0000-000000000002/5d000000-0000-0000-0000-000000000001.webp')$$,'owner uploads across events');
select lives_ok($$select public.upsert_team('9d000000-0000-0000-0000-000000000005','3d000000-0000-0000-0000-000000000001','{"id":"4d000000-0000-0000-0000-000000000001","code":"T01","name_en":"Renamed","avatar_key":"lion","color_hex":"#123456","image_path":null}')$$,'owner explicitly removes picture');
select is(public.get_event_setup('3d000000-0000-0000-0000-000000000001')->'teams'->0->'image_path','null'::jsonb,'removal saves null');
select lives_ok($$select public.upsert_team('9d000000-0000-0000-0000-000000000005','3d000000-0000-0000-0000-000000000001','{}')$$,'operation replay remains idempotent');
reset role;
select is((select count(*)::int from public.audit_log where event_id='3d000000-0000-0000-0000-000000000001' and action='TEAM_UPDATED'),4,'four logical changes audited once each');
select * from finish();
rollback;
