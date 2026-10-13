begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- Phase 8 fixtures; RPCs are exercised with client roles.
insert into auth.users(id)
select ('18000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,full_name_ar,system_role,is_active)
select ('28000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('18000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'phase8_member_'||n,'+20122222222'||n,'Referee '||n,'حكم '||n,
  case when n=1 then 'OWNER' else 'MEMBER' end,n<>4
from generate_series(1,5) n;
insert into public.events(id,code,name_en,created_by) values
('38000000-0000-0000-0000-000000000001','P8-EVENT','Phase 8 Event','28000000-0000-0000-0000-000000000001');
insert into public.games(id,event_id,code,name_en) values
('58000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','G01','Relay'),
('58000000-0000-0000-0000-000000000002','38000000-0000-0000-0000-000000000001','G02','Puzzle');
insert into public.event_roles(event_id,member_id,role,team_id) values
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','REFEREE',null),
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000003','REFEREE',null),
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000004','REFEREE',null),
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000005','EVENT_ADMIN',null);
insert into public.referee_games(event_id,member_id,game_id) values
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000003','58000000-0000-0000-0000-000000000001'),
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000001'),
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000004','58000000-0000-0000-0000-000000000001'),
-- Leftover assignment without the REFEREE role must not be published.
('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000005','58000000-0000-0000-0000-000000000002');

set local role anon;
select is(jsonb_array_length(public.get_bootstrap('38000000-0000-0000-0000-000000000001')->'games'->0->'referees'),2,
  'game lists its active assigned referees only');
select is(public.get_bootstrap('38000000-0000-0000-0000-000000000001')->'games'->0->'referees'->0->>'name_en','Referee 2',
  'referees are ordered by name');
select is(public.get_bootstrap('38000000-0000-0000-0000-000000000001')->'games'->0->'referees'->1->>'name_ar','حكم 3',
  'referee Arabic name is public');
select is(public.get_bootstrap('38000000-0000-0000-0000-000000000001')->'games'->1->'referees','[]'::jsonb,
  'assignment without the referee role is not published');
select ok(not exists(select 1 from jsonb_array_elements(public.get_bootstrap('38000000-0000-0000-0000-000000000001')->'games') g
  cross join lateral jsonb_array_elements(g->'referees') r cross join lateral jsonb_object_keys(r) k
  where k not in ('name_en','name_ar')),'referee entries expose names only');
select ok(public.get_bootstrap('38000000-0000-0000-0000-000000000001')::text !~ '(phase8_member_|\+2012)',
  'referee usernames and phones are never published');
select throws_ok($$select public.phase8_game_referees_json('58000000-0000-0000-0000-000000000001')$$,'42501',null,
  'internal referee builder is not client-callable');
reset role;

-- Slice 5: LIVES scoring mode. Member 5 is the event administrator.
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex) values
('48000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','T01','Alpha','falcon','#123456'),
('48000000-0000-0000-0000-000000000002','38000000-0000-0000-0000-000000000001','T02','Bravo','lion','#123456'),
('48000000-0000-0000-0000-000000000003','38000000-0000-0000-0000-000000000001','T03','Charlie','star','#123456'),
('48000000-0000-0000-0000-000000000004','38000000-0000-0000-0000-000000000001','T04','Delta','owl','#123456');
insert into public.rounds(id,event_id,number,type,duration_min) values
('68000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001',1,'REGULAR',10),
('68000000-0000-0000-0000-000000000002','38000000-0000-0000-0000-000000000001',2,'REGULAR',10),
('68000000-0000-0000-0000-000000000003','38000000-0000-0000-0000-000000000001',3,'REGULAR',10),
('68000000-0000-0000-0000-000000000004','38000000-0000-0000-0000-000000000001',4,'REGULAR',10);

select is((select scoring_mode||'|'||life_emoji from public.events where id='38000000-0000-0000-0000-000000000001'),'POINTS|❤️',
  'existing and new events default to points scoring');

set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','{"scoring_mode":"LIVES"}')$$,
  'P0001','INVALID_SETTINGS','lives mode requires a starting number of lives');
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','{"scoring_mode":"HEARTS"}')$$,
  'P0001','INVALID_SETTINGS','unknown scoring mode rejected');
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','{"scoring_mode":"LIVES","initial_lives":0}')$$,
  'P0001','INVALID_SETTINGS','zero starting lives rejected');
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','{"scoring_mode":"LIVES","initial_lives":10000}')$$,
  'P0001','INVALID_SETTINGS','more than 9999 starting hearts rejected (D053)');
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','{"life_emoji":"   "}')$$,
  'P0001','INVALID_SETTINGS','blank life emoji rejected');
select is(public.upsert_event_settings('98000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001',
  '{"scoring_mode":"lives","initial_lives":3,"life_emoji":" 💛 "}')->'settings'->>'scoring_mode','LIVES',
  'event admin switches to lives mode before play');
select is(public.upsert_event_settings('98000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001',
  '{"scoring_mode":"lives","initial_lives":3,"life_emoji":" 💛 "}')->'settings'->>'initial_lives','3',
  'settings replay returns the stored receipt');
reset role;
select is((select life_emoji from public.events where id='38000000-0000-0000-0000-000000000001'),'💛','life emoji is trimmed and stored');
set local role anon;
select is(public.get_bootstrap('38000000-0000-0000-0000-000000000001') is not null,true,'bootstrap still readable');
reset role;
update public.events set is_current=false where is_current;
update public.events set is_current=true where id='38000000-0000-0000-0000-000000000001';
set local role anon;
select is(public.get_current_event()->>'scoring_mode','LIVES','public event exposes the scoring mode');
select is(public.get_current_event()->>'initial_lives','3','public event exposes the starting lives');
select is(public.get_current_event()->>'life_emoji','💛','public event exposes the life emoji');
reset role;

-- Play: Alpha W,L; Bravo L,L,F; Charlie L,L,L,L (+1 bonus); Delta D.
update public.rounds set status='CLOSED',started_at=now()-interval '2 hours',closed_at=now()-interval '1 hour'
  where event_id='38000000-0000-0000-0000-000000000001';
insert into public.matches(id,event_id,round_id,game_id,status) values
('78000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000001','COMPLETED'),
('78000000-0000-0000-0000-000000000002','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000002','COMPLETED'),
('78000000-0000-0000-0000-000000000003','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000001','COMPLETED'),
('78000000-0000-0000-0000-000000000004','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000002','COMPLETED'),
('78000000-0000-0000-0000-000000000005','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000003','58000000-0000-0000-0000-000000000001','COMPLETED'),
('78000000-0000-0000-0000-000000000006','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000004','58000000-0000-0000-0000-000000000001','COMPLETED'),
('78000000-0000-0000-0000-000000000007','38000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000004','58000000-0000-0000-0000-000000000002','VOID');
insert into public.match_participants(match_id,round_id,team_id,side,outcome) values
('78000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000001','A','WIN'),
('78000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000002','B','LOSS'),
('78000000-0000-0000-0000-000000000002','68000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000003','A','LOSS'),
('78000000-0000-0000-0000-000000000002','68000000-0000-0000-0000-000000000001','48000000-0000-0000-0000-000000000004','B','DRAW'),
('78000000-0000-0000-0000-000000000003','68000000-0000-0000-0000-000000000002','48000000-0000-0000-0000-000000000001','A','LOSS'),
('78000000-0000-0000-0000-000000000003','68000000-0000-0000-0000-000000000002','48000000-0000-0000-0000-000000000003','B','LOSS'),
('78000000-0000-0000-0000-000000000004','68000000-0000-0000-0000-000000000002','48000000-0000-0000-0000-000000000002','A','LOSS'),
('78000000-0000-0000-0000-000000000005','68000000-0000-0000-0000-000000000003','48000000-0000-0000-0000-000000000002','A','FORFEIT'),
('78000000-0000-0000-0000-000000000005','68000000-0000-0000-0000-000000000003','48000000-0000-0000-0000-000000000003','B','LOSS'),
('78000000-0000-0000-0000-000000000006','68000000-0000-0000-0000-000000000004','48000000-0000-0000-0000-000000000003','A','LOSS'),
-- A void match never costs a life.
('78000000-0000-0000-0000-000000000007','68000000-0000-0000-0000-000000000004','48000000-0000-0000-0000-000000000004','A','LOSS');
insert into public.adjustments(event_id,scope,team_id,points,reason,given_by) values
('38000000-0000-0000-0000-000000000001','EVENT','48000000-0000-0000-0000-000000000003',1,'Spirit bonus','28000000-0000-0000-0000-000000000005');

create temp table p8_rows as select value as r from jsonb_array_elements(public.phase6_standings('38000000-0000-0000-0000-000000000001'));
select is((select r->>'total' from p8_rows where r->'team'->>'code'='T01'),'2','win keeps a life, loss costs one (3 to 2)');
select is((select r->>'total' from p8_rows where r->'team'->>'code'='T04'),'3','draw keeps lives and void matches cost nothing');
select is((select r->>'total' from p8_rows where r->'team'->>'code'='T02'),'0','forfeit costs a life like a loss');
select is((select r->>'match_points' from p8_rows where r->'team'->>'code'='T03'),'-1','hearts may go below zero (D053)');
select is((select r->>'total' from p8_rows where r->'team'->>'code'='T03'),'0','a team below zero keeps playing and bonuses still count');
select is((select r->>'rank' from p8_rows where r->'team'->>'code'='T04'),'1','most lives ranks first');
select is((select r->>'losses' from p8_rows where r->'team'->>'code'='T03'),'4','loss counts stay available');

set local role authenticated;
select set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','{"scoring_mode":"POINTS"}')$$,
  'P0001','SCORING_LOCKED','scoring mode is fixed once a round has started');
select throws_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001','{"initial_lives":5}')$$,
  'P0001','SCORING_LOCKED','starting lives are fixed once a round has started');
select lives_ok($$select public.upsert_event_settings(gen_random_uuid(),'38000000-0000-0000-0000-000000000001',
  '{"scoring_mode":"LIVES","initial_lives":3,"life_emoji":"🔥","name_en":"Renamed"}')$$,
  'unchanged scoring with other edits is still allowed after start');
reset role;
select is((select life_emoji from public.events where id='38000000-0000-0000-0000-000000000001'),'🔥','emoji can change during play');

-- Tie positions clear when the scoring rules change (before play).
update public.rounds set status='DRAFT',started_at=null,closed_at=null where event_id='38000000-0000-0000-0000-000000000001';
update public.teams set final_tiebreak_pos=1 where id='48000000-0000-0000-0000-000000000001';
update public.events set initial_lives=4 where id='38000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.teams where event_id='38000000-0000-0000-0000-000000000001' and final_tiebreak_pos is not null),0,
  'changing starting lives clears manual tie orders');

-- Import Event sheet accepts the new fields with validation.
select lives_ok($$select public.phase3_check_record('Event','{"name_en":"E","points_win":2,"points_draw":1,"points_loss":0,"currency_en_one":"P","currency_en_other":"Ps","currency_ar_one":"ن","currency_ar_two":"ن","currency_ar_plural":"ن","scoring_mode":"LIVES","initial_lives":5,"life_emoji":"❤️"}')$$,
  'import accepts lives scoring fields');
select throws_ok($$select public.phase3_check_record('Event','{"name_en":"E","points_win":2,"points_draw":1,"points_loss":0,"currency_en_one":"P","currency_en_other":"Ps","currency_ar_one":"ن","currency_ar_two":"ن","currency_ar_plural":"ن","scoring_mode":"HEARTS"}')$$,
  'P0001','INVALID_FIELD','import rejects unknown scoring modes');
select throws_ok($$select public.phase3_check_record('Event','{"name_en":"E","points_win":2,"points_draw":1,"points_loss":0,"currency_en_one":"P","currency_en_other":"Ps","currency_ar_one":"ن","currency_ar_two":"ن","currency_ar_plural":"ن","initial_lives":0}')$$,
  'P0001','INVALID_FIELD','import rejects zero starting lives');

select * from finish();
rollback;
