begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

insert into auth.users(id) select ('1a000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,7) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,full_name_ar,system_role,is_active)
select ('2a000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('1a000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'audit_reader_'||n,'+20188888888'||n,'Reader '||n,'عضو '||n,
  case when n=1 then 'OWNER' else 'MEMBER' end,n<>6 from generate_series(1,7) n;
insert into public.events(id,code,name_en,leaderboard_public) values
('3a000000-0000-0000-0000-000000000001','AUDIT-READER','Audit event',true),
('3a000000-0000-0000-0000-000000000002','AUDIT-OTHER','Other event',false),
('3a000000-0000-0000-0000-000000000003','AUDIT-EMPTY','Empty event',false);
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
('4a000000-0000-0000-0000-000000000001','3a000000-0000-0000-0000-000000000001','T01','Team','falcon','#123456');
insert into public.event_roles(event_id,member_id,role,team_id) values
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','EVENT_ADMIN',null),
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000003','REFEREE',null),
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000004','GUIDE','4a000000-0000-0000-0000-000000000001'),
('3a000000-0000-0000-0000-000000000002','2a000000-0000-0000-0000-000000000005','EVENT_ADMIN',null),
('3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000006','EVENT_ADMIN',null);
-- Deliberately equal timestamps and IDs larger than JavaScript's exact range.
insert into public.audit_log(id,event_id,actor_id,action,entity,before,after,at) overriding system value values
(9007199254740993,'3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','TEAM_CREATED','team',null,'{"name_en":"Before"}',now()),
(9007199254740994,'3a000000-0000-0000-0000-000000000001','2a000000-0000-0000-0000-000000000002','TEAM_UPDATED','team','{"name_en":"Before"}','{"name_en":"After"}',now()),
(9007199254740995,'3a000000-0000-0000-0000-000000000001',null,'ROUND_STARTED','round',null,'{"status":"ACTIVE"}',now()),
(9007199254740996,'3a000000-0000-0000-0000-000000000002',null,'OTHER_SECRET','event',null,'{}',now()),
(9007199254740997,null,null,'MEMBER_SECRET','member',null,'{}',now());

set local role anon;
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot execute audit reader');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee denied even with public leaderboard');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','guide denied');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','other-event admin denied');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','inactive admin denied');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000007',true);
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','unassigned member denied');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(public.get_audit_log('3a000000-0000-0000-0000-000000000001')->'items'),3,'event admin reads own event only');
select ok(public.get_audit_log('3a000000-0000-0000-0000-000000000001')::text !~ 'OTHER_SECRET|MEMBER_SECRET|phone|auth_user_id','no other-event/global entries or actor contacts');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001',2)->>'next_before','9007199254740994','exact bigint cursor returned');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001',2)->'items'->0->>'id','9007199254740995','newest ID first with tied timestamps');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001',2,9007199254740994)->'items'->0->>'id','9007199254740993','cursor excludes prior page without skipping tied times');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001',2,9007199254740994)->>'next_before',null,'last page has no cursor');
select is(jsonb_array_length(public.get_audit_log('3a000000-0000-0000-0000-000000000001',50,null,'TEAM_UPDATED','team')->'items'),1,'filters combined on server');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001',50,null,'TEAM_UPDATED')->'items'->0->'actor'->>'name_ar','عضو 2','actor names localized');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001',50,null,'TEAM_UPDATED')->'items'->0->'before'->>'name_en','Before','before snapshot included');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001',50,null,'TEAM_UPDATED')->'items'->0->'after'->>'name_en','After','after snapshot included');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001')->'items'->0->>'actor',null,'system actor handled');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000001')->'actions','["ROUND_STARTED","TEAM_CREATED","TEAM_UPDATED"]'::jsonb,'filter options scoped to event');
select throws_ok($$select * from public.audit_log$$,'42501',null,'direct table reads remain denied');
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001',0)$$,'P0001','INVALID_AUDIT_QUERY','zero page limit rejected');
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001',101)$$,'P0001','INVALID_AUDIT_QUERY','large page limit rejected');
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001',null)$$,'P0001','INVALID_AUDIT_QUERY','null page limit rejected');
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001',50,0)$$,'P0001','INVALID_AUDIT_QUERY','invalid cursor rejected');
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.get_audit_log('3a000000-0000-0000-0000-000000000002')->'items'),1,'owner reads other event');
select is(public.get_audit_log('3a000000-0000-0000-0000-000000000003')->'items','[]'::jsonb,'empty event returns empty page');
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000099')$$,'P0001','NOT_FOUND','owner unknown event rejected');
reset role;
delete from public.event_roles where member_id='2a000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.get_audit_log('3a000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','revoked admin cannot load another page');
reset role;
select * from finish();
rollback;
