begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id) select ('10000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1,6) n;
insert into members(id, auth_user_id, username, full_name_en, system_role, is_active)
select ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'test_' || n, 'Test ' || n, case when n = 1 then 'OWNER' else 'MEMBER' end, n <> 6
from generate_series(1,6) n;
insert into events(id,code,name_en) values ('30000000-0000-0000-0000-000000000001','TEST','Test'),('30000000-0000-0000-0000-000000000002','OTHER','Other');
insert into teams(id,event_id,code,name_en,avatar_key,color_hex) values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','T01','Test','falcon','#087F8C');
insert into games(id,event_id,code,name_en) values ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','G01','Game'),('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','G02','Other game');
insert into rounds(id,event_id,number,duration_min) values ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,10);
insert into matches(id,event_id,round_id,game_id) values ('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),('70000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002');
insert into event_roles(event_id,member_id,role,team_id) values
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','EVENT_ADMIN',null),
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','REFEREE',null),
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','GUIDE','40000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006','EVENT_ADMIN',null);
insert into referee_games values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001');

-- Matrix against actual permission helpers, with JWT identities and SQL roles.
set local role anon;
select is(current_member_id(), null::uuid, 'anonymous has no member');
select is(is_owner(), false, 'anonymous is not owner');
select is(can_see_results('30000000-0000-0000-0000-000000000001'), false, 'anonymous hidden outcomes denied');
select lives_ok('select server_now()', 'public clock works');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is(is_owner(),true,'owner recognized');
select is(is_event_admin('30000000-0000-0000-0000-000000000002'),true,'owner administers all events');
select is(can_see_results('30000000-0000-0000-0000-000000000001'),true,'owner sees hidden outcomes');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is(is_owner(),false,'event admin cannot use owner power');
select is(is_event_admin('30000000-0000-0000-0000-000000000001'),true,'event admin own event');
select is(is_event_admin('30000000-0000-0000-0000-000000000002'),false,'event admin cross-event denied');
select is(can_see_results('30000000-0000-0000-0000-000000000001'),true,'event admin sees hidden outcomes');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is(is_referee_for_match('70000000-0000-0000-0000-000000000001'),true,'referee assigned game');
select is(is_referee_for_match('70000000-0000-0000-0000-000000000002'),false,'referee unassigned game denied');
select is(is_event_admin('30000000-0000-0000-0000-000000000001'),false,'referee cannot administer');
select is(can_see_results('30000000-0000-0000-0000-000000000001'),false,'referee other hidden results denied');
select is(is_staff('30000000-0000-0000-0000-000000000001'),true,'assigned referee is staff');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select is(is_staff('30000000-0000-0000-0000-000000000001'),false,'guide is read-only');
select is(can_see_results('30000000-0000-0000-0000-000000000001'),false,'guide hidden outcomes denied');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select is(is_staff('30000000-0000-0000-0000-000000000001'),false,'unassigned member has no event powers');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select is(current_member_id(),null::uuid,'inactive member revoked immediately');
select is(is_event_admin('30000000-0000-0000-0000-000000000001'),false,'inactive admin denied');
reset role;
update events set leaderboard_public = true;
set local role anon;
select is(can_see_results('30000000-0000-0000-0000-000000000001'),true,'anonymous public outcomes allowed');
reset role;

-- No domain table read/write grants, even for owners using authenticated JWTs.
select ok(c.relrowsecurity, c.relname || ' has RLS') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
select ok(not has_table_privilege(r, 'public.' || t, p), r || ' denied ' || p || ' on ' || t)
from unnest(array['anon','authenticated']) r
cross join unnest(array['members','events','teams','games','rounds','matches','match_participants','event_roles','referee_games','adjustments','audit_log','client_ops','login_attempts']) t
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
select ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' cannot call ' || f)
from unnest(array['anon','authenticated']) r cross join unnest(array['public.audit(uuid,text,text,uuid,jsonb,jsonb)','public.emit(uuid,text,jsonb)','public.op_result(uuid,text)','public.op_complete(uuid,text,jsonb)']) f;
set local role authenticated;
select throws_ok('select * from members', '42501', null, 'actual direct member read denied');
select throws_ok($$insert into events(code,name_en) values('HACK','Hack')$$, '42501', null, 'actual direct event write denied');
reset role;

-- Internal idempotency storage binds the result to its actor and RPC.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is(op_result('80000000-0000-0000-0000-000000000001','test_rpc'),null::jsonb,'fresh operation');
select is(op_complete('80000000-0000-0000-0000-000000000001','test_rpc','{"ok":true}'::jsonb),'{"ok":true}'::jsonb,'store result');
select is(op_complete('80000000-0000-0000-0000-000000000001','test_rpc','{"ok":false}'::jsonb),'{"ok":true}'::jsonb,'retry returns first result');
select is((select count(*) from client_ops),1::bigint,'one operation stored');
select ok(not has_function_privilege('anon','public.block_auth_email(jsonb)','EXECUTE'),'anonymous cannot call mail hook');
select ok(not has_function_privilege('authenticated','public.block_auth_email(jsonb)','EXECUTE'),'authenticated cannot call mail hook');
select ok(has_function_privilege('supabase_auth_admin','public.block_auth_email(jsonb)','EXECUTE'),'GoTrue can call mail hook');
select is(block_auth_email('{}'::jsonb),'{"error":{"http_code":403,"message":"EMAIL_DISABLED"}}'::jsonb,'mail hook denies all delivery');
select throws_ok($$select op_result('80000000-0000-0000-0000-000000000001','different_rpc')$$,'P0001','OP_ID_CONFLICT','RPC cannot reuse operation');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select throws_ok($$select op_result('80000000-0000-0000-0000-000000000001','test_rpc')$$,'P0001','OP_ID_CONFLICT','different actor cannot replay');

select * from finish();
rollback;
