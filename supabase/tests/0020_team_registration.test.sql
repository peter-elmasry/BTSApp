begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id) select ('11000000-0029-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;
insert into public.members(id,auth_user_id,username,full_name_en,system_role)
select ('22000000-0029-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('11000000-0029-0000-0000-'||lpad(n::text,12,'0'))::uuid,'registration_'||n,'Registration Staff '||n,
  case when n=1 then 'OWNER' else 'MEMBER' end from generate_series(1,5) n;
update public.events set is_current=false where is_current;
insert into public.events(id,code,name_en,status,is_current) values
  ('33000000-0029-0000-0000-000000000001','REG-ONE','Registration Event','LIVE',true),
  ('33000000-0029-0000-0000-000000000002','REG-TWO','Other Event','DRAFT',false);
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
  ('44000000-0029-0000-0000-000000000001','33000000-0029-0000-0000-000000000001','T01','One','falcon','#123456'),
  ('44000000-0029-0000-0000-000000000002','33000000-0029-0000-0000-000000000001','T02','Two','star','#654321'),
  ('44000000-0029-0000-0000-000000000003','33000000-0029-0000-0000-000000000002','T01','Other','star','#654321');
insert into public.event_roles(event_id,member_id,role,team_id) values
  ('33000000-0029-0000-0000-000000000001','22000000-0029-0000-0000-000000000002','EVENT_ADMIN',null),
  ('33000000-0029-0000-0000-000000000001','22000000-0029-0000-0000-000000000003','GUIDE','44000000-0029-0000-0000-000000000001'),
  ('33000000-0029-0000-0000-000000000001','22000000-0029-0000-0000-000000000004','REFEREE',null),
  ('33000000-0029-0000-0000-000000000001','22000000-0029-0000-0000-000000000005','GUIDE','44000000-0029-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0029-0000-0000-000000000003',true);
select lives_ok($$select public.manage_team_invite('99000000-0029-0000-0000-000000000001','33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001','CREATE')$$,'guide creates own team invite');
select set_config('test.reg_token',(public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')->'invites'->0->>'token'),true);
select set_config('test.reg_invite',(public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')->'invites'->0->>'id'),true);
select throws_ok($$select public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000002')$$,'P0001','FORBIDDEN','guide cannot read other team');
select throws_ok($$select public.manage_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000002','CREATE')$$,'P0001','FORBIDDEN','guide cannot create other team invite');
select throws_ok($$select public.set_player_registration_open(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',false)$$,'P0001','FORBIDDEN','guide cannot pause event');
select throws_ok($$select public.preview_invite_rollback('33000000-0029-0000-0000-000000000001',current_setting('test.reg_invite')::uuid)$$,'P0001','FORBIDDEN','guide cannot batch undo');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is(public.get_team_invite('33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'))->'team'->>'code','T01','public invite resolves correct team');
select ok(not (public.get_team_invite('33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'))::text ~ 'phone|auth_user_id|device_hash'),'public invite contains no private fields');
select throws_ok($$select public.get_team_invite('33000000-0029-0000-0000-000000000002',current_setting('test.reg_token'))$$,'P0001','INVITE_UNAVAILABLE','token cannot cross events');
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),'bad','Player',null)$$,'P0001','INVALID_RECEIPT','invalid device secret rejected');
select throws_ok($$select public.join_team_invite(null,'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('a',64),'Player',null)$$,'P0001','INVALID_OP_ID','operation ID required');
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('a',64),'   ',null)$$,'P0001','INVALID_PLAYER_NAME','blank name rejected');
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('a',64),'Player','abc')$$,'P0001','INVALID_PHONE','bad supplied phone rejected');
select set_config('test.reg_id',(public.join_team_invite('99000000-0029-0000-0000-000000000002','33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('a',64),'  Same   Name  ',null)->>'id'),true);
select is(public.get_player_registration('33000000-0029-0000-0000-000000000001',repeat('a',64))->>'team_code','T01','name-only registration remembered');
select is(public.join_team_invite('99000000-0029-0000-0000-000000000002','33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('a',64),'Ignored','01012345678')->>'id',current_setting('test.reg_id'),'exact retry applies once');
select is(public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('a',64),'Ignored',null)->>'id',current_setting('test.reg_id'),'new operation on same device still reuses registration');
select throws_ok($$select public.join_team_invite('99000000-0029-0000-0000-000000000002','33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('b',64),'Other',null)$$,'P0001','OP_ID_CONFLICT','another device cannot reuse operation ID');
select is(public.get_player_registration('33000000-0029-0000-0000-000000000001',repeat('b',64)),null::jsonb,'another device cannot read receipt');
select lives_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('b',64),'Same Name','01012345678')$$,'same name and optional local mobile accepted');
select throws_ok($$select * from public.player_registrations$$,'42501',null,'anonymous cannot read registration table');
select throws_ok($$select * from public.team_invites$$,'42501',null,'anonymous cannot enumerate invite tokens');
select throws_ok($$select public.registration_receipt(current_setting('test.reg_id')::uuid)$$,'42501',null,'receipt helper is private');
select throws_ok($$select public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')$$,'42501',null,'anonymous cannot read roster');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0029-0000-0000-000000000003',true);
select is(public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')->'players'->0->>'name','Same Name','name whitespace normalized');
select ok((public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')->'players') @> '[{"phone":"+201012345678"}]'::jsonb,'phone normalized');
select is(public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')->'players'->0->>'possible_duplicate','true','duplicate name flagged without merging');
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('c',64),'Guide',null)$$,'P0001','STAFF_USE_ASSIGNED_TEAM','staff cannot register as guest');
select throws_ok($$select public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,1,'TRANSFER',null,null,'44000000-0029-0000-0000-000000000002','wrong team')$$,'P0001','FORBIDDEN','guide cannot transfer');
select throws_ok($$select public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,1,'REMOVE')$$,'P0001','REASON_REQUIRED','correction reason required');
select is(public.correct_player_registration('99000000-0029-0000-0000-000000000003','33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,1,'EDIT','Corrected',null,null,'name typo')->>'version','2','guide edits own player');
select throws_ok($$select public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,1,'REMOVE',null,null,null,'stale draft')$$,'P0001','REGISTRATION_CHANGED','stale correction refused');
select is(public.correct_player_registration('99000000-0029-0000-0000-000000000004','33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,2,'REMOVE',null,null,null,'mistake')->>'status','REMOVED','guide removes player');
select is(public.correct_player_registration('99000000-0029-0000-0000-000000000004','33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,2,'REMOVE',null,null,null,'retry')->>'version','3','staff correction retry applies once');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is(public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'),repeat('a',64),'Retry',null)->>'status','REMOVED','guest retry cannot undo removal');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0029-0000-0000-000000000003',true);
select is(public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,3,'RESTORE',null,null,null,'restored')->>'status','ACTIVE','guide restores player');
select lives_ok($$select public.manage_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001','REPLACE')$$,'guide replaces invite');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_ok($$select public.get_team_invite('33000000-0029-0000-0000-000000000001',current_setting('test.reg_token'))$$,'P0001','INVITE_UNAVAILABLE','old link invalid after replacement');
select is(public.get_player_registration('33000000-0029-0000-0000-000000000001',repeat('a',64))->>'status','ACTIVE','replacement preserves players');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0029-0000-0000-000000000002',true);
select throws_ok($$select public.get_team_players('33000000-0029-0000-0000-000000000002','44000000-0029-0000-0000-000000000003')$$,'P0001','FORBIDDEN','admin cannot cross event');
select is(public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,4,'TRANSFER',null,null,'44000000-0029-0000-0000-000000000002','wrong team')->>'team_code','T02','admin transfers player');
select set_config('test.reg_snapshot',public.preview_invite_rollback('33000000-0029-0000-0000-000000000001',current_setting('test.reg_invite')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.reg_snapshot')::jsonb),2,'batch preview includes transferred player');
select throws_ok($$select public.rollback_invite_registrations(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_invite')::uuid,'[]','mistaken link')$$,'P0001','REGISTRATION_CHANGED','mismatched preview prevents bulk change');
select is(public.rollback_invite_registrations('99000000-0029-0000-0000-000000000005','33000000-0029-0000-0000-000000000001',current_setting('test.reg_invite')::uuid,current_setting('test.reg_snapshot')::jsonb,'mistaken link')->>'count','2','previewed batch removed atomically');
select is(public.rollback_invite_registrations('99000000-0029-0000-0000-000000000005','33000000-0029-0000-0000-000000000001',current_setting('test.reg_invite')::uuid,current_setting('test.reg_snapshot')::jsonb,'retry')->>'count','2','batch retry returns receipt');
select is(public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,6,'RESTORE',null,null,null,'individual correction')->>'version','7','individual restoration after batch');
select is(public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,7,'REMOVE',null,null,null,'later individual removal')->>'version','8','later individual removal supersedes batch');
select is(public.restore_registration_batch(gen_random_uuid(),'33000000-0029-0000-0000-000000000001','99000000-0029-0000-0000-000000000005','undo batch mistake')->>'count','1','restore batch preserves subsequent individual correction');
select lives_ok($$select public.set_player_registration_open(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',false)$$,'admin pauses registrations');
select set_config('test.reg_new_token',(select i->>'token' from jsonb_array_elements(public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')->'invites') i where (i->>'enabled')::boolean),true);
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_new_token'),repeat('c',64),'Paused',null)$$,'P0001','INVITE_UNAVAILABLE','pause enforced server-side');
select is(public.get_player_registration('33000000-0029-0000-0000-000000000001',repeat('a',64))->>'team_code','T02','device receives staff transfer even when registration paused');
select is(public.get_player_registration('33000000-0029-0000-0000-000000000001',repeat('a',64))->>'status','REMOVED','device receives later removal');
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0029-0000-0000-000000000004',true);
select throws_ok($$select public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee cannot read roster');
select set_config('request.jwt.claim.sub','11000000-0029-0000-0000-000000000003',true);
select throws_ok($$select public.correct_player_registration(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_id')::uuid,8,'RESTORE',null,null,null,'not my player')$$,'P0001','FORBIDDEN','old guide loses transferred player');
reset role;
delete from public.event_roles where member_id='22000000-0029-0000-0000-000000000003';
set local role authenticated;
select throws_ok($$select public.get_team_players('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001')$$,'P0001','FORBIDDEN','reassigned guide loses roster access');
select set_config('request.jwt.claim.sub','11000000-0029-0000-0000-000000000001',true);
select lives_ok($$select public.get_team_players('33000000-0029-0000-0000-000000000002','44000000-0029-0000-0000-000000000003')$$,'owner reads any event roster');
select throws_ok($$select * from public.player_registrations$$,'42501',null,'staff cannot bypass RPC with direct reads');
reset role;
select is((select count(*)::int from public.player_registrations where event_id='33000000-0029-0000-0000-000000000001'),2,'retries and corrections never duplicate membership');
select ok(not exists(select 1 from public.audit_log where event_id='33000000-0029-0000-0000-000000000001' and
  (coalesce(before::text,'')||coalesce(after::text,'')) ~ 'device_hash|201012345678|"token"'),'audit excludes phone and device/invite secrets');
select throws_ok($$delete from public.teams where id='44000000-0029-0000-0000-000000000001'$$,'23503',null,'setup deletion cannot erase registration history');
select ok(not (public.get_bootstrap('33000000-0029-0000-0000-000000000001')::text ~ 'Same Name|Corrected|device_hash|201012345678'), 'public bootstrap excludes player details');
update public.events set registration_open=true where id='33000000-0029-0000-0000-000000000001';
update public.team_invites set expires_at=now()-interval '1 second' where token=current_setting('test.reg_new_token');
set local role anon;
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_new_token'),repeat('c',64),'Expired',null)$$,'P0001','INVITE_UNAVAILABLE','expired link cannot enroll');
reset role;
update public.team_invites set expires_at=now()+interval '1 day' where token=current_setting('test.reg_new_token');
update public.events set status='FINISHED' where id='33000000-0029-0000-0000-000000000001';
set local role anon;
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_new_token'),repeat('c',64),'Finished',null)$$,'P0001','INVITE_UNAVAILABLE','finished event cannot enroll');
reset role;
update public.events set status='LIVE' where id='33000000-0029-0000-0000-000000000001';
-- A second team's link must never move this already registered device.
insert into public.team_invites(event_id,team_id) values('33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000002');
select set_config('test.reg_other_token',(select token from public.team_invites where team_id='44000000-0029-0000-0000-000000000002'),true);
set local role anon;
select is(public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_other_token'),repeat('b',64),'Different Team',null)->>'team_code','T01','another link cannot move registered player');
reset role;
insert into public.player_registrations(event_id,team_id,invite_id,device_hash,name)
select '33000000-0029-0000-0000-000000000001','44000000-0029-0000-0000-000000000001',
  (select id from public.team_invites where token=current_setting('test.reg_new_token')),
  encode(extensions.digest('synthetic-rate-fixture-'||n,'sha256'),'hex'),'Synthetic Player '||n
from generate_series(1,30) n;
set local role anon;
select throws_ok($$select public.join_team_invite(gen_random_uuid(),'33000000-0029-0000-0000-000000000001',current_setting('test.reg_new_token'),repeat('d',64),'Limited',null)$$,'P0001','REGISTRATION_RATE_LIMIT','server limits per-link join burst');
reset role;
select * from finish();
rollback;
