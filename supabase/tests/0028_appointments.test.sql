begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
create function pg_temp.ap_id(n int) returns uuid language sql immutable as $$ select ('37000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid $$;
insert into auth.users(id) select pg_temp.ap_id(n) from generate_series(1,6) n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role)
select pg_temp.ap_id(n+10),pg_temp.ap_id(n),'appointment_test_'||n,'Appointment member '||n,
  case when n=1 then 'OWNER' else 'MEMBER' end from generate_series(1,6) n;
insert into public.appointment_sessions(id,title,opens_at,closes_at,status,created_by,cutoff_minutes) values
  (pg_temp.ap_id(21),'Independent draft',now()-interval '1 day',now()+interval '3 days','DRAFT',pg_temp.ap_id(11),60),
  (pg_temp.ap_id(22),'Parallel session',now()-interval '1 day',now()+interval '3 days','PUBLISHED',pg_temp.ap_id(11),60),
  (pg_temp.ap_id(23),'Private draft',now()-interval '1 day',now()+interval '3 days','DRAFT',pg_temp.ap_id(11),60);
insert into public.appointment_slots(id,session_id,interviewer_id,starts_at,ends_at) values
  (pg_temp.ap_id(31),pg_temp.ap_id(21),pg_temp.ap_id(12),now()+interval '1 day',now()+interval '1 day 20 minutes'),
  (pg_temp.ap_id(32),pg_temp.ap_id(21),pg_temp.ap_id(12),now()+interval '1 day 30 minutes',now()+interval '1 day 50 minutes'),
  (pg_temp.ap_id(33),pg_temp.ap_id(22),pg_temp.ap_id(15),now()+interval '1 day',now()+interval '1 day 20 minutes'),
  (pg_temp.ap_id(34),pg_temp.ap_id(22),pg_temp.ap_id(15),now()+interval '2 days',now()+interval '2 days 20 minutes'),
  (pg_temp.ap_id(35),pg_temp.ap_id(23),pg_temp.ap_id(16),now()+interval '1 day',now()+interval '1 day 20 minutes');
insert into public.appointment_slots(id,session_id,interviewer_id,starts_at,ends_at) values
  (pg_temp.ap_id(37),pg_temp.ap_id(21),pg_temp.ap_id(12),now()+interval '1 day 2 hours',now()+interval '1 day 2 hours 20 minutes');
insert into public.events(id,code,name_en) values (pg_temp.ap_id(61),'APPOINTMENT-ROLES','Appointment role isolation');
insert into public.event_roles(event_id,member_id,role) values (pg_temp.ap_id(61),pg_temp.ap_id(14),'EVENT_ADMIN');
create function pg_temp.ap_payload(n int) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select to_jsonb(s) from public.appointment_sessions s where id=pg_temp.ap_id(n) $$;
select ok(not has_table_privilege('authenticated','public.appointment_bookings','SELECT'),'bookings have no direct member read');
select ok(not has_table_privilege('anon','public.appointment_sessions','SELECT'),'sessions are not public');
select ok(not has_table_privilege('authenticated','public.appointment_slots','INSERT'),'slots have no direct writes');
select ok(not has_function_privilege('anon','public.list_appointment_sessions()','EXECUTE'),'anonymous cannot list');
select ok(not has_function_privilege('authenticated','public.appointment_check_slot(uuid,timestamptz,timestamptz,uuid)','EXECUTE'),'internal overlap helper cannot be called');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.list_appointment_sessions()$$,'P0001','FORBIDDEN','missing member fails closed');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(3)::text,true);
select is(jsonb_array_length(public.list_appointment_sessions()),1,'ordinary member sees only published session');
select throws_ok($$select public.get_appointment_session(pg_temp.ap_id(23))$$,'P0001','FORBIDDEN','other draft denied');
select throws_ok($$select public.get_appointment_options()$$,'P0001','FORBIDDEN','member cannot read owner directory');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21))$$,'P0001','FORBIDDEN','member cannot configure sessions');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(31),'display_name','Member'))$$,'P0001','APPOINTMENT_UNAVAILABLE','draft cannot be booked');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(1)::text,true);
select lives_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21)||'{"status":"PUBLISHED"}')$$,'owner publishes independent draft');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21)||'{"version":1}')$$,'P0001','APPOINTMENT_CHANGED','stale settings rejected');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21)||'{"timezone":"Bad/Zone"}')$$,'P0001','INVALID_APPOINTMENT','timezone validated server side');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21)||'{"meeting_url":"javascript:alert(1)"}')$$,'P0001','INVALID_APPOINTMENT','unsafe meeting URLs rejected');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SLOT',jsonb_build_object('session_id',pg_temp.ap_id(22),'interviewer_id',pg_temp.ap_id(12),'starts_at',now()+interval '1 day 10 minutes','ends_at',now()+interval '1 day 25 minutes'))$$,'P0001','APPOINTMENT_OVERLAP','interviewer conflicts checked across sessions');
select lives_ok($$select public.appointment_write(pg_temp.ap_id(81),'GENERATE_SLOTS',jsonb_build_object('session_id',pg_temp.ap_id(21),'interviewer_id',pg_temp.ap_id(12),'starts_at',now()+interval '2 days','ends_at',now()+interval '2 days 1 hour','duration_minutes',20,'gap_minutes',10))$$,'generated slots accept break intervals');
select is((public.appointment_write(pg_temp.ap_id(81),'GENERATE_SLOTS',jsonb_build_object('session_id',pg_temp.ap_id(21),'interviewer_id',pg_temp.ap_id(12),'starts_at',now()+interval '2 days','ends_at',now()+interval '2 days 1 hour','duration_minutes',20,'gap_minutes',10))->>'count')::int,2,'same operation returns the two-slot receipt');
select throws_ok($$select public.appointment_write(pg_temp.ap_id(81),'GENERATE_SLOTS',jsonb_build_object('session_id',pg_temp.ap_id(21)))$$,'P0001','OP_ID_CONFLICT','operation IDs are bound to action and payload');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'GENERATE_SLOTS',jsonb_build_object('session_id',pg_temp.ap_id(21),'interviewer_id',pg_temp.ap_id(12),'starts_at',now()+interval '2 days 50 minutes','ends_at',now()+interval '2 days 1 hour','duration_minutes',20,'gap_minutes',0))$$,'P0001','INVALID_APPOINTMENT','empty generator rejected');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'GENERATE_SLOTS',jsonb_build_object('session_id',pg_temp.ap_id(21),'interviewer_id',pg_temp.ap_id(12),'starts_at',now()+interval '1 day 90 minutes','ends_at',now()+interval '1 day 150 minutes','duration_minutes',20,'gap_minutes',10))$$,'P0001','APPOINTMENT_OVERLAP','late conflict aborts entire generator');
select is(jsonb_array_length(public.get_appointment_session(pg_temp.ap_id(21))->'slots'),5,'failed generation leaves no partial slots');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(3)::text,true);
select throws_ok($$select public.appointment_write(gen_random_uuid(),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(31),'display_name',' '))$$,'P0001','INVALID_NAME','name required');
select lives_ok($$select public.appointment_write(pg_temp.ap_id(82),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(31),'display_name','Member Three'))$$,'member books by authenticated identity');
select is((public.get_my_appointments()->0->>'display_name'),'Member Three','member can read own booking');
select is((public.get_my_appointments()->0->>'member_id'),pg_temp.ap_id(13)::text,'booking binds to caller');
select lives_ok($$select public.appointment_write(pg_temp.ap_id(82),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(31),'display_name','Member Three'))$$,'lost response retry is idempotent');
select is(jsonb_array_length(public.get_my_appointments()),1,'replay never duplicates booking');
select ok(public.get_appointment_operation(pg_temp.ap_id(82)) is not null,'caller can reconcile own operation');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(32),'display_name','Member Three'))$$,'P0001','ALREADY_BOOKED','one booking per session');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(33),'display_name','Member Three'))$$,'P0001','APPOINTMENT_OVERLAP','attendee overlap across sessions denied');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'ATTEND',jsonb_build_object('booking_id',public.get_my_appointments()->0->>'id','version',1,'status','COMPLETED'))$$,'P0001','FORBIDDEN','attendee cannot mark attendance');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(4)::text,true);
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21))$$,'P0001','FORBIDDEN','sports event admin has no appointment management power');
select is(jsonb_array_length(public.get_my_appointments()),0,'other member cannot read attendee schedule');
select is((public.get_appointment_session(pg_temp.ap_id(21))->'slots'->0->'booking'),'null'::jsonb,'other member receives availability without attendee');
select ok(public.get_appointment_operation(pg_temp.ap_id(82)) is null,'other member cannot inspect operation');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(31),'display_name','Other member'))$$,'P0001','SLOT_TAKEN','occupied slot refuses a competing member');
select lives_ok($$select public.appointment_write(pg_temp.ap_id(83),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(32),'display_name','Member Four'))$$,'other member books another slot');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(3)::text,true);
select throws_ok($$select public.appointment_write(gen_random_uuid(),'RESCHEDULE',jsonb_build_object('booking_id',public.get_my_appointments()->0->>'id','version',1,'slot_id',pg_temp.ap_id(32)))$$,'P0001','SLOT_TAKEN','failed move refuses occupied target');
select is(public.get_my_appointments()->0->>'slot_id',pg_temp.ap_id(31)::text,'failed move retains original reservation');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'RESCHEDULE',jsonb_build_object('booking_id',public.get_my_appointments()->0->>'id','version',1,'slot_id',pg_temp.ap_id(34)))$$,'P0001','INVALID_APPOINTMENT','cannot reschedule to another session');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(2)::text,true);
select is(jsonb_array_length(public.get_my_appointments(true)),2,'assigned interviewer sees own two attendees');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'ATTEND',jsonb_build_object('booking_id',public.get_my_appointments(true)->0->>'id','version',1,'status','COMPLETED'))$$,'P0001','INVALID_ATTENDANCE','future attendance rejected');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(33),'display_name','Interviewer'))$$,'P0001','APPOINTMENT_OVERLAP','interviewer cannot book over own interviewing slot');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(5)::text,true);
select is(jsonb_array_length(public.get_my_appointments(true)),0,'other interviewer cannot see attendees');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(1)::text,true);
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SLOT',jsonb_build_object('id',pg_temp.ap_id(31),'session_id',pg_temp.ap_id(21),'version',1,'blocked',true))$$,'P0001','BOOKED_SLOT_LOCKED','owner cannot block occupied slot');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21)||'{"location":"New location"}')$$,'P0001','BOOKED_SLOT_LOCKED','booked location cannot silently move');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(4)::text,true);
select lives_ok($$select public.appointment_write(gen_random_uuid(),'CANCEL',jsonb_build_object('booking_id',public.get_my_appointments()->0->>'id','version',1))$$,'attendee cancels own booking before cutoff');
select is(public.get_my_appointments()->0->>'status','CANCELLED','cancelled history retained');
select is(jsonb_array_length(public.get_appointment_session(pg_temp.ap_id(21))->'history'),1,'cancelled attendee can read their private history');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(3)::text,true);
select lives_ok($$select public.appointment_write(pg_temp.ap_id(84),'RESCHEDULE',jsonb_build_object('booking_id',public.get_my_appointments()->0->>'id','version',1,'slot_id',pg_temp.ap_id(32)))$$,'atomic reschedule succeeds after target released');
select is(public.get_my_appointments()->0->>'slot_id',pg_temp.ap_id(32)::text,'move preserves booking identity and updates slot');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'CANCEL',jsonb_build_object('booking_id',public.get_my_appointments()->0->>'id','version',1))$$,'P0001','APPOINTMENT_CHANGED','stale booking version rejected');
select lives_ok($$select public.appointment_write(pg_temp.ap_id(82),'BOOK',jsonb_build_object('slot_id',pg_temp.ap_id(31),'display_name','Member Three'))$$,'old replay does not move booking back');
select is(public.get_my_appointments()->0->>'slot_id',pg_temp.ap_id(32)::text,'replay preserves later reschedule');
reset role;
update public.appointment_sessions set cutoff_minutes=10080 where id=pg_temp.ap_id(21);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.ap_id(3)::text,true);
select throws_ok($$select public.appointment_write(gen_random_uuid(),'CANCEL',jsonb_build_object('booking_id',public.get_my_appointments()->0->>'id','version',2))$$,'P0001','CUTOFF_PASSED','cutoff enforced server side');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(1)::text,true);
select lives_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21)||'{"status":"CANCELLED"}')$$,'owner explicitly cancels session');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'SAVE_SESSION',pg_temp.ap_payload(21)||'{"status":"PUBLISHED"}')$$,'P0001','APPOINTMENT_UNAVAILABLE','cancelled sessions cannot be republished over conflicts');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(3)::text,true);
select is(public.get_my_appointments()->0->>'status','CANCELLED','session cancellation cancels outstanding bookings');
reset role;
insert into public.appointment_sessions(id,title,opens_at,closes_at,status,created_by) values
  (pg_temp.ap_id(25),'Attendance',now()-interval '2 days',now()-interval '1 hour','CLOSED',pg_temp.ap_id(11));
insert into public.appointment_slots(id,session_id,interviewer_id,starts_at,ends_at) values
  (pg_temp.ap_id(38),pg_temp.ap_id(25),pg_temp.ap_id(12),now()-interval '70 minutes',now()-interval '50 minutes'),
  (pg_temp.ap_id(39),pg_temp.ap_id(25),pg_temp.ap_id(12),now()-interval '30 minutes',now()-interval '10 minutes');
insert into public.appointment_bookings(id,session_id,slot_id,member_id,display_name) values
  (pg_temp.ap_id(51),pg_temp.ap_id(25),pg_temp.ap_id(38),pg_temp.ap_id(13),'Past attendee'),
  (pg_temp.ap_id(52),pg_temp.ap_id(25),pg_temp.ap_id(39),pg_temp.ap_id(14),'Absent attendee');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.ap_id(5)::text,true);
select throws_ok($$select public.appointment_write(gen_random_uuid(),'ATTEND',jsonb_build_object('booking_id',pg_temp.ap_id(51),'version',1,'status','COMPLETED'))$$,'P0001','FORBIDDEN','unassigned interviewer cannot mark attendance');
select set_config('request.jwt.claim.sub',pg_temp.ap_id(2)::text,true);
select lives_ok($$select public.appointment_write(pg_temp.ap_id(85),'ATTEND',jsonb_build_object('booking_id',pg_temp.ap_id(51),'version',1,'status','COMPLETED'))$$,'assigned interviewer records completed appointment');
select lives_ok($$select public.appointment_write(gen_random_uuid(),'ATTEND',jsonb_build_object('booking_id',pg_temp.ap_id(52),'version',1,'status','NO_SHOW'))$$,'assigned interviewer records no-show');
select lives_ok($$select public.appointment_write(pg_temp.ap_id(85),'ATTEND',jsonb_build_object('booking_id',pg_temp.ap_id(51),'version',1,'status','COMPLETED'))$$,'attendance replay preserves original receipt');
select throws_ok($$select public.appointment_write(gen_random_uuid(),'CANCEL',jsonb_build_object('booking_id',pg_temp.ap_id(51),'version',2))$$,'P0001','FORBIDDEN','interviewer has no authority to cancel attendee booking');
reset role;
update public.members set is_active=false where id=pg_temp.ap_id(13);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.ap_id(3)::text,true);
select throws_ok($$select public.get_my_appointments()$$,'P0001','FORBIDDEN','deactivated attendee cannot read old bookings');
select throws_ok($$select public.get_appointment_operation(pg_temp.ap_id(82))$$,'P0001','FORBIDDEN','deactivated caller cannot replay receipt');
reset role;
update public.members set must_change_password=true where id=pg_temp.ap_id(16);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.ap_id(6)::text,true);
select throws_ok($$select public.list_appointment_sessions()$$,'P0001','FORBIDDEN','temporary-password accounts cannot access appointment data');
reset role;
select ok(exists(select 1 from public.audit_log where entity='appointment' and entity_id=pg_temp.ap_id(21) and event_id is null),'independent mutations audited without an event');
select is((select count(*)::int from public.client_ops where op_id=pg_temp.ap_id(82)),1,'one durable operation receipt');
select * from finish();
rollback;
