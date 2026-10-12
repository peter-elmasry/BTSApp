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

select * from finish();
rollback;
