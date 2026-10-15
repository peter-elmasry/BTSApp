begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id) select ('1e000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role,is_active)
select ('2e000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
('1e000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'attachment_test_'||n,'Attachment Test '||n,
case when n=1 then 'OWNER' else 'MEMBER' end,true from generate_series(1,3) n;
insert into public.events(id,code,name_en) values
('3e000000-0000-0000-0000-000000000001','ATT-ONE','Attachments'),
('3e000000-0000-0000-0000-000000000002','ATT-TWO','Other');
insert into public.event_roles(event_id,member_id,role) values
('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000002','EVENT_ADMIN'),
('3e000000-0000-0000-0000-000000000001','2e000000-0000-0000-0000-000000000003','REFEREE');
insert into public.rounds(id,event_id,number,type,duration_min) values
('6e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001',0,'OPENING',10),
('6e000000-0000-0000-0000-000000000002','3e000000-0000-0000-0000-000000000001',1,'REGULAR',10),
('6e000000-0000-0000-0000-000000000003','3e000000-0000-0000-0000-000000000002',0,'OPENING',10);
set local role authenticated;
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000002',true);
select lives_ok($$insert into storage.objects(bucket_id,name) values('opening-attachments','3e000000-0000-0000-0000-000000000001/6e000000-0000-0000-0000-000000000001/5e000000-0000-0000-0000-000000000001.pdf')$$,'admin uploads PDF for opening round');
select throws_ok($$insert into storage.objects(bucket_id,name) values('opening-attachments','3e000000-0000-0000-0000-000000000001/6e000000-0000-0000-0000-000000000002/5e000000-0000-0000-0000-000000000001.pdf')$$,'42501',null,'regular round upload denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('opening-attachments','3e000000-0000-0000-0000-000000000002/6e000000-0000-0000-0000-000000000003/5e000000-0000-0000-0000-000000000001.pdf')$$,'42501',null,'other event upload denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('opening-attachments','invalid/path.pdf')$$,'42501',null,'malformed path denied without UUID cast error');
select lives_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000001','6e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001/6e000000-0000-0000-0000-000000000001/5e000000-0000-0000-0000-000000000001.pdf','application/pdf','Instructions',false)$$,'admin stores hidden attachment');
select is(public.get_event_setup('3e000000-0000-0000-0000-000000000001')->'rounds'->0->>'attachment_title','Instructions','admin sees hidden metadata');
select throws_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000002','6e000000-0000-0000-0000-000000000002',null,null,null,false)$$,'P0001','INVALID_ATTACHMENT','regular round metadata denied');
select throws_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000003','6e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000002/6e000000-0000-0000-0000-000000000003/5e000000-0000-0000-0000-000000000001.pdf','application/pdf',null,true)$$,'P0001','INVALID_ATTACHMENT','cross-event attachment metadata denied');
select throws_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000004','6e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001/6e000000-0000-0000-0000-000000000001/5e000000-0000-0000-0000-000000000001.pdf','image/webp',null,true)$$,'P0001','INVALID_ATTACHMENT','MIME and extension must agree');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is(public.get_bootstrap('3e000000-0000-0000-0000-000000000001')->'rounds'->0->'attachment','null'::jsonb,'hidden metadata is not public');
select throws_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000005','6e000000-0000-0000-0000-000000000001',null,null,null,false)$$,'42501',null,'anonymous cannot mutate');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000006','6e000000-0000-0000-0000-000000000001',null,null,null,false)$$,'P0001','FORBIDDEN','referee cannot mutate');
select throws_ok($$insert into storage.objects(bucket_id,name) values('opening-attachments','3e000000-0000-0000-0000-000000000001/6e000000-0000-0000-0000-000000000001/5e000000-0000-0000-0000-000000000002.webp')$$,'42501',null,'referee cannot upload');
select set_config('request.jwt.claim.sub','1e000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000007','6e000000-0000-0000-0000-000000000001','3e000000-0000-0000-0000-000000000001/6e000000-0000-0000-0000-000000000001/5e000000-0000-0000-0000-000000000001.pdf','application/pdf','Instructions',true)$$,'admin publishes attachment');
select lives_ok($$select public.set_opening_attachment('9e000000-0000-0000-0000-000000000007','6e000000-0000-0000-0000-000000000001',null,null,null,false)$$,'duplicate op returns saved result');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is(public.get_bootstrap('3e000000-0000-0000-0000-000000000001')->'rounds'->0->'attachment'->>'mime','application/pdf','anonymous viewers receive published PDF');
select is((select count(*)::int from storage.objects where bucket_id='opening-attachments' and name='3e000000-0000-0000-0000-000000000001/6e000000-0000-0000-0000-000000000001/5e000000-0000-0000-0000-000000000001.pdf'),1,'anonymous file reads allowed');
reset role;
select is((select count(*)::int from public.audit_log where event_id='3e000000-0000-0000-0000-000000000001' and action='OPENING_ATTACHMENT_UPDATED'),2,'publish replay does not duplicate audit');
select * from finish();
rollback;
