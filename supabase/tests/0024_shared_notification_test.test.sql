begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
-- Test fanout transactionally without any external requests.
create or replace function public.wake_round_push() returns void language plpgsql as $$ begin return; end $$;
insert into auth.users(id) select ('13300000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3)n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role,is_active)
select ('23300000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('13300000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'shared_test_'||n,'Shared Test '||n,case when n=1 then 'OWNER' else 'MEMBER' end,true from generate_series(1,3)n;
update public.events set is_current=false where is_current;
insert into public.events(id,code,name_en,is_current) values
('33300000-0000-0000-0000-000000000001','SHARED-ONE','Shared One',true),
('33300000-0000-0000-0000-000000000002','SHARED-TWO','Shared Two',false);
insert into public.event_roles(event_id,member_id,role) values
('33300000-0000-0000-0000-000000000001','23300000-0000-0000-0000-000000000002','EVENT_ADMIN'),
('33300000-0000-0000-0000-000000000001','23300000-0000-0000-0000-000000000003','REFEREE');
insert into public.round_push_devices(receipt_hash,event_id,subscription,language,expires_at)
select repeat(n::text,64),case when n=4 then '33300000-0000-0000-0000-000000000002'::uuid else '33300000-0000-0000-0000-000000000001'::uuid end,
jsonb_build_object('endpoint','https://fcm.googleapis.com/shared-test-'||n,'keys',jsonb_build_object('p256dh',repeat('B',87),'auth',repeat('A',22))),
'en',clock_timestamp()+case when n=3 then interval '-1 day' else interval '1 day' end from generate_series(1,4)n;
set local role anon;
select throws_ok($$select public.test_event_notifications('83300000-0000-0000-0000-000000000001','33300000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous cannot broadcast a group test');
select throws_ok('select * from public.event_notification_tests','42501',null,'test marker table is private');
select is(public.get_notification_test('33300000-0000-0000-0000-000000000001')->'test','null'::jsonb,'initial public test is empty');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13300000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.test_event_notifications('83300000-0000-0000-0000-000000000001','33300000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referees cannot broadcast');
select set_config('request.jwt.claim.sub','13300000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.test_event_notifications('83300000-0000-0000-0000-000000000001','33300000-0000-0000-0000-000000000002')$$,'P0001','FORBIDDEN','admin cannot broadcast to another event');
select is((public.test_event_notifications('83300000-0000-0000-0000-000000000001','33300000-0000-0000-0000-000000000001')->>'devices')::int,2,'admin fans out to current unexpired subscriptions only');
select is((public.test_event_notifications('83300000-0000-0000-0000-000000000001','33300000-0000-0000-0000-000000000001')->>'devices')::int,2,'operation retry returns original acknowledgment');
select throws_ok($$select public.test_event_notifications('83300000-0000-0000-0000-000000000002','33300000-0000-0000-0000-000000000001')$$,'P0001','TEST_RATE_LIMITED','different operation cannot bypass event cooldown');
reset role;
select is((select count(*) from public.round_push_deliveries where event_id='33300000-0000-0000-0000-000000000001'),2::bigint,'retry does not duplicate delivery');
select is((select count(distinct occurrence) from public.round_push_deliveries where event_id='33300000-0000-0000-0000-000000000001'),1::bigint,'all device jobs share one occurrence');
select is((select count(*) from public.audit_log where event_id='33300000-0000-0000-0000-000000000001' and action='NOTIFICATION_TEST'),1::bigint,'test is audited once');
set local role anon;
select is((select count(*) from jsonb_object_keys(public.get_notification_test('33300000-0000-0000-0000-000000000001')->'test')),2::bigint,'public test exposes only occurrence and timestamp');
select is(public.get_notification_test('33300000-0000-0000-0000-000000000002')->'test','null'::jsonb,'another event cannot leak the test');
reset role;
update public.event_notification_tests set occurred_at=clock_timestamp()-interval '61 seconds';
set local role anon;
select is(public.get_notification_test('33300000-0000-0000-0000-000000000001')->'test','null'::jsonb,'stale tests are not replayed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13300000-0000-0000-0000-000000000001',true);
select throws_ok($$do $test$ begin
  perform public.test_event_notifications('83300000-0000-0000-0000-000000000003','33300000-0000-0000-0000-000000000001');
  raise exception 'ROLLBACK_TEST';
end $test$;$$,'P0001','ROLLBACK_TEST','failed transaction rolls back shared test and fanout');
reset role;
select is((select count(*) from public.round_push_deliveries where event_id='33300000-0000-0000-0000-000000000001'),2::bigint,'rollback leaves no new deliveries');
set local role authenticated;
select is((public.test_event_notifications('83300000-0000-0000-0000-000000000003','33300000-0000-0000-0000-000000000001')->>'devices')::int,2,'owner can retry after rollback and expired cooldown');
select throws_ok($$select public.test_event_notifications('83300000-0000-0000-0000-000000000004','33300000-0000-0000-0000-000000000002')$$,'P0001','EVENT_UNAVAILABLE','owner cannot target a non-current event');
reset role;
update public.events set status='FINISHED' where id='33300000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.test_event_notifications('83300000-0000-0000-0000-000000000005','33300000-0000-0000-0000-000000000001')$$,'P0001','EVENT_UNAVAILABLE','finished events cannot broadcast');
reset role;
select * from finish();
rollback;
