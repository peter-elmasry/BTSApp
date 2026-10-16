begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select ok(has_function_privilege('anon','public.get_event_update_token(uuid)','execute'), 'Anonymous viewers may check a thin recovery token');
create temp table signal_token(value text);
insert into signal_token select public.get_event_update_token('33000000-0030-0000-0000-000000000001');
insert into public.events(id,code,name_en) values
 ('33000000-0030-0000-0000-000000000001','SIGNAL-ONE','Signal one'),
 ('33000000-0030-0000-0000-000000000002','SIGNAL-TWO','Signal two');
update public.events set is_current=false where is_current;
update public.events set is_current=true where id='33000000-0030-0000-0000-000000000001';
select isnt(public.get_event_update_token('33000000-0030-0000-0000-000000000001'),(select value from signal_token), 'Current event changes alter the recovery token');
select ok(exists(select 1 from realtime.messages where topic='event:33000000-0030-0000-0000-000000000001'
 and event='settings_changed' and payload='{"type":"settings_changed"}'::jsonb),
 'Selecting current event emits an identifier-only settings notification');
update public.events set is_current=(id='33000000-0030-0000-0000-000000000002')
 where id in ('33000000-0030-0000-0000-000000000001','33000000-0030-0000-0000-000000000002');
select ok(exists(select 1 from realtime.messages where topic='event:33000000-0030-0000-0000-000000000002'
 and event='settings_changed'), 'New current event viewers are notified');
select ok((select count(*)>=2 from realtime.messages where topic='event:33000000-0030-0000-0000-000000000001'
 and event='settings_changed'), 'Previous current event viewers are notified');
select ok(not has_function_privilege('anon','public.signal_current_event_change()','execute'), 'Anonymous callers cannot invoke trigger helper');
select ok(not has_function_privilege('authenticated','public.signal_admin_assignment_change()','execute'), 'Staff cannot invoke assignment trigger helper');
select * from finish();
rollback;
