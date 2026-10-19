begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id) values ('18000000-0000-0000-0000-000000000001'),('18000000-0000-0000-0000-000000000002'),('18000000-0000-0000-0000-000000000003'),('18000000-0000-0000-0000-000000000004');
insert into public.members(id,auth_user_id,username,full_name_en,system_role) values
('28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001','history_owner','History owner','OWNER'),
('28000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000002','history_admin','History admin','MEMBER'),
('28000000-0000-0000-0000-000000000003','18000000-0000-0000-0000-000000000003','history_ref','History referee','MEMBER'),
('28000000-0000-0000-0000-000000000004','18000000-0000-0000-0000-000000000004','history_other','History other','MEMBER');
insert into public.events(id,code,name_en,event_type) values
('38000000-0000-0000-0000-000000000001','HIST','Production day','PROD'),
('38000000-0000-0000-0000-000000000002','HISTTEST','Rehearsal','TEST'),
('38000000-0000-0000-0000-000000000003','HISTOTHER','Other event','PROD');
insert into public.event_roles(event_id,member_id,role) values
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','EVENT_ADMIN'),
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000003','REFEREE'),
('38000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000003','REFEREE'),
('38000000-0000-0000-0000-000000000003','28000000-0000-0000-0000-000000000004','EVENT_ADMIN');
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
('48000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','T01','One','falcon','#123456'),
('48000000-0000-0000-0000-000000000002','38000000-0000-0000-0000-000000000001','T02','Two','lion','#654321');
insert into public.games(id,event_id,code,name_en) values ('58000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','G01','Game');
insert into public.rounds(id,event_id,number,duration_min) values ('68000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001',1,10);
insert into public.matches(id,event_id,round_id,game_id) values ('78000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001');
insert into public.match_participants(match_id,round_id,team_id,side) values
('78000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','A'),
('78000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000002','B');
insert into public.referee_games(event_id,member_id,game_id) values ('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000003','58000000-0000-0000-0000-000000000001');
insert into public.team_invites(id,event_id,team_id,created_by) values ('88000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002');
insert into public.player_registrations(event_id,team_id,invite_id,device_hash,name,phone) values ('38000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000001','test-hash','Player','+201000000001');
select ok(not has_function_privilege('anon','public.get_event_recap(uuid)','EXECUTE'),'anonymous cannot read recap');
select ok(not has_function_privilege('anon','public.get_my_event_history()','EXECUTE'),'history requires authentication');
select ok(not has_function_privilege('authenticated','public.event_completion_blockers(uuid)','EXECUTE'),'internal builder is private');
set local role anon;
select is(public.get_event_header('38000000-0000-0000-0000-000000000002')->>'event_type','TEST','anonymous header identifies test event');
select is(public.get_event_header('38000000-0000-0000-0000-000000000001') ? 'phone',false,'header has no private contact data');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.get_my_event_history()->'history'),0,'unfinished PROD and TEST absent from history');
select throws_ok($$select public.get_event_recap('38000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee cannot read private recap');
select throws_ok($$select public.finish_event(gen_random_uuid(),'38000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','referee cannot finish');
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.get_event_recap('38000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','different-event moderator cannot read recap');
select throws_ok($$select public.finish_event(gen_random_uuid(),'38000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','different-event moderator cannot finish');
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.finish_event(gen_random_uuid(),'38000000-0000-0000-0000-000000000001')$$,'P0001','EVENT_INCOMPLETE','open round blocks completion');
select is(jsonb_array_length(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'blockers'->'round_ids'),1,'recap identifies blocking round');
select is(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'players'->0->>'name','Player','admin sees joined player');
select is(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'players'->0->>'phone','+201000000001','private screen may read phone');
select is(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'players'->0 ? 'token',false,'recap omits invitation token');
select is(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'players'->0 ? 'device_hash',false,'recap omits device identity');
select throws_ok($$select public.set_event_type(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','TEST')$$,'P0001','FORBIDDEN','moderator cannot change classification');
reset role;
update public.rounds set status='CLOSED',closed_at=now() where id='68000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.finish_event(gen_random_uuid(),'38000000-0000-0000-0000-000000000001')$$,'P0001','EVENT_INCOMPLETE','closed rounds still require all results');
reset role;
update public.matches set status='COMPLETED' where id='78000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.finish_event(gen_random_uuid(),'38000000-0000-0000-0000-000000000001')$$,'P0001','EVENT_INCOMPLETE','completed status cannot hide pending participant outcomes');
reset role;
update public.match_participants set outcome=case side when 'A' then 'WIN' else 'LOSS' end where match_id='78000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(jsonb_array_length(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'blockers'->'match_ids'),0,'valid regular results satisfy completion');
reset role;
update public.matches set status='VOID' where id='78000000-0000-0000-0000-000000000001';
update public.match_participants set outcome='PENDING' where match_id='78000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(jsonb_array_length(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'blockers'->'match_ids'),0,'void match is excluded even with pending outcomes');
reset role;
update public.matches set status='SCHEDULED' where id='78000000-0000-0000-0000-000000000001';
update public.games set is_neutral=true where id='58000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
select is(public.finish_event('98000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001')->>'status','FINISHED','moderator finishes closed event with effective neutral results');
select is(public.finish_event('98000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001')->>'status','FINISHED','same operation safely replays');
select throws_ok($$select public.finish_event(gen_random_uuid(),'38000000-0000-0000-0000-000000000001')$$,'P0001','EVENT_FINISHED','new completion operation cannot repeat finish');
select throws_ok($$select public.reopen_round(gen_random_uuid(),'68000000-0000-0000-0000-000000000001','try reopening')$$,'P0001','EVENT_FINISHED','finished rounds cannot reopen');
select throws_ok($$select public.set_player_registration_open(gen_random_uuid(),'38000000-0000-0000-0000-000000000001',true)$$,'P0001','EVENT_FINISHED','finished registration cannot reopen');
select is(public.get_event_recap('38000000-0000-0000-0000-000000000001')->'standings',public.get_export_data('38000000-0000-0000-0000-000000000001')->'standings','recap and XLSX totals agree');
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.get_my_event_history()->'history'),1,'assigned referee sees completed PROD');
select is(public.get_my_event_history()->'history'->0->'roles'->0->>'role','REFEREE','history explains participation');
select is(public.get_my_event_history()->'history'->0->>'can_recap','false','history grants no recap permission');
select is(jsonb_array_length(public.get_my_event_history()->'managed'),0,'referee has no managed events');
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.get_my_event_history()->'history'),0,'owner is not automatically an attendee');
select is(public.set_event_type('98000000-0000-0000-0000-000000000002','38000000-0000-0000-0000-000000000002','PROD')->>'event_type','PROD','owner changes draft type');
select throws_ok($$select public.set_event_type(gen_random_uuid(),'38000000-0000-0000-0000-000000000002','INVALID')$$,'P0001','INVALID_EVENT_TYPE','invalid classification rejected');
select throws_ok($$select public.set_event_type(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','TEST')$$,'P0001','EVENT_TYPE_LOCKED','completed classification locked');
select is(public.create_typed_event('98000000-0000-0000-0000-000000000003','NEWTEST','New rehearsal',null,null,'TEST')->>'event_type','TEST','owner creates TEST event');
select is(public.create_typed_event('98000000-0000-0000-0000-000000000003','NEWTEST','New rehearsal',null,null,'TEST')->>'event_type','TEST','typed creation replay');
select throws_ok($$select public.create_typed_event('98000000-0000-0000-0000-000000000003','NEWTEST','New rehearsal',null,null,'PROD')$$,'P0001','OP_ID_CONFLICT','replay is payload bound');
select lives_ok($$select public.finish_event(gen_random_uuid(),'38000000-0000-0000-0000-000000000002')$$,'owner can finish an empty event');
reset role;
select is((select registration_open from public.events where id='38000000-0000-0000-0000-000000000001'),false,'completion closes registration');
select is((select count(*) from public.audit_log where event_id='38000000-0000-0000-0000-000000000001' and action='EVENT_FINISHED'),1::bigint,'completion audit emitted once');
select throws_ok($$update public.games set is_neutral=false where id='58000000-0000-0000-0000-000000000001'$$,'P0001','EVENT_FINISHED','neutral reversal cannot make finished results incomplete');
update public.matches set status='COMPLETED' where id='78000000-0000-0000-0000-000000000001';
update public.match_participants set outcome=case side when 'A' then 'WIN' else 'LOSS' end where match_id='78000000-0000-0000-0000-000000000001';
update public.games set is_neutral=false where id='58000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.submit_match_result(gen_random_uuid(),'78000000-0000-0000-0000-000000000001','[{"team_id":"48000000-0000-0000-0000-000000000001","outcome":"LOSS"},{"team_id":"48000000-0000-0000-0000-000000000002","outcome":"WIN"}]'::jsonb)$$,'moderators can correct completed results after finish');
select throws_ok($$select public.reset_match_result(gen_random_uuid(),'78000000-0000-0000-0000-000000000001')$$,'P0001','EVENT_FINISHED','moderator cannot reset finished event to pending');
reset role;
update public.members set is_active=false where id='28000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.get_my_event_history()$$,'P0001','UNAUTHORIZED','inactive member loses history access');
select throws_ok($$select public.get_event_recap('38000000-0000-0000-0000-000000000001')$$,'P0001','FORBIDDEN','inactive moderator loses private recap');
reset role;
select * from finish();
rollback;

