begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

set local role anon;
select throws_ok($$select public.begin_login_attempt('lockout_test')$$, '42501', null, 'anonymous cannot reserve attempts');
select throws_ok($$select public.finish_login_attempt(gen_random_uuid(), false)$$, '42501', null, 'anonymous cannot record results');
select throws_ok($$select * from public.login_limits$$, '42501', null, 'anonymous cannot inspect lockouts');
reset role;
set local role authenticated;
select throws_ok($$select public.begin_login_attempt('lockout_test')$$, '42501', null, 'authenticated cannot reserve attempts');
select throws_ok($$select public.finish_login_attempt(gen_random_uuid(), false)$$, '42501', null, 'authenticated cannot record results');
select throws_ok($$select * from public.login_pending$$, '42501', null, 'authenticated cannot inspect reservations');
reset role;

insert into public.login_attempts(identifier, attempted_at, success)
select 'lockout_test', clock_timestamp() - n * interval '1 minute', false from generate_series(1,4) n;
set local role service_role;
select is(public.begin_login_attempt('lockout_test')->>'status', 'allowed', 'four failures admit the fifth attempt');
select is(public.begin_login_attempt('lockout_test')->>'status', 'busy', 'reserved fifth slot prevents concurrent overflow');
select ok(public.finish_login_attempt((select id from public.login_pending where identifier='lockout_test'), false), 'fifth failure is durably completed');
select is(public.begin_login_attempt('lockout_test')->>'status', 'locked', 'fifth failure locks the identifier');
select ok((select locked_until > clock_timestamp() + interval '9 minutes 59 seconds' from public.login_limits where identifier='lockout_test'), 'deadline is ten minutes after the fifth failure');
reset role;

-- Move the original failures outside the moving window, keeping the deadline:
-- this is the A02 regression (first failure at 0, fifth at 4, request at 10.5).
update public.login_attempts set attempted_at = attempted_at - interval '6 minutes 30 seconds' where identifier='lockout_test';
update public.login_limits set locked_until = clock_timestamp() + interval '3 minutes 30 seconds' where identifier='lockout_test';
create temporary table expected_deadline as select locked_until from public.login_limits where identifier='lockout_test';
set local role service_role;
select is(public.begin_login_attempt('lockout_test')->>'status', 'locked', 'lock persists after earlier failures age out');
reset role;
select is((select locked_until from public.login_limits where identifier='lockout_test'), (select locked_until from expected_deadline), 'blocked attempts do not extend lockout');
update public.login_limits set locked_until = clock_timestamp() - interval '1 second' where identifier='lockout_test';
set local role service_role;
select is(public.begin_login_attempt('lockout_test')->>'status', 'allowed', 'expired lock admits a fresh attempt');
select ok(public.finish_login_attempt((select id from public.login_pending where identifier='lockout_test'), true), 'successful login is recorded');
select is((select count(*) from public.login_attempts where identifier='lockout_test' and success), 1::bigint, 'success history is retained');
select ok(not public.finish_login_attempt(gen_random_uuid(), false), 'unknown completions are rejected');
reset role;

create temporary table reservation as select (public.begin_login_attempt('expired_test')->>'attempt_id')::uuid id;
update public.login_pending set expires_at = clock_timestamp() - interval '1 second' where identifier='expired_test';
select ok(not public.finish_login_attempt((select id from reservation), true), 'expired completion cannot release tokens');
select is(public.begin_login_attempt('expired_test')->>'status', 'allowed', 'abandoned reservation does not permanently block login');
select is((select count(*) from public.login_pending where identifier='expired_test'), 1::bigint, 'expired reservations are cleaned');

-- Failure persistence and lockout state are one transaction.
create function pg_temp.reject_login_history() returns trigger language plpgsql as $$
begin raise exception 'fixture storage failure'; end $$;
create trigger reject_login_history before insert on public.login_attempts
for each row execute function pg_temp.reject_login_history();
select throws_ok($$select public.finish_login_attempt((select id from public.login_pending where identifier='expired_test'), false)$$,
  'P0001', 'fixture storage failure', 'failed attempt persistence aborts completion');
select is((select count(*) from public.login_pending where identifier='expired_test'), 1::bigint, 'failed persistence preserves reservation');
drop trigger reject_login_history on public.login_attempts;
select ok(public.finish_login_attempt((select id from public.login_pending where identifier='expired_test'), false), 'retry can finish after persistence recovers');
select ok(not public.finish_login_attempt((select id from reservation), true), 'replayed or expired completion cannot succeed');

select * from finish();
rollback;
