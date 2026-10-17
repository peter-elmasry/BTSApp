begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
-- D073: exact decimal adjustments in both scoring modes; old integer callers remain valid.
insert into auth.users(id) values ('1d000000-0000-0000-0000-000000000001');
insert into public.members(id,auth_user_id,username,full_name_en,system_role) values
('2d000000-0000-0000-0000-000000000001','1d000000-0000-0000-0000-000000000001','decimal_owner','Decimal Owner','OWNER');
insert into public.events(id,code,name_en,scoring_mode,initial_lives,event_bonus_cap,event_penalty_cap,match_bonus_cap,match_penalty_cap)
values ('3d000000-0000-0000-0000-000000000001','DECIMALS','Decimals','LIVES',10,1,1,1,1);
insert into public.teams(id,event_id,code,name_en,avatar_key,color_hex)
select ('4d000000-0000-0000-0000-00000000000'||n)::uuid,'3d000000-0000-0000-0000-000000000001','T0'||n,'Team '||n,'falcon','#123456' from generate_series(1,3) n;
insert into public.games(id,event_id,code,name_en) values ('5d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001','G01','Game');
insert into public.rounds(id,event_id,number,duration_min) values ('6d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001',1,15);
insert into public.matches(id,event_id,round_id,game_id) values ('7d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001','6d000000-0000-0000-0000-000000000001','5d000000-0000-0000-0000-000000000001');
insert into public.match_participants(match_id,round_id,team_id,side) values
('7d000000-0000-0000-0000-000000000001','6d000000-0000-0000-0000-000000000001','4d000000-0000-0000-0000-000000000001','A'),
('7d000000-0000-0000-0000-000000000001','6d000000-0000-0000-0000-000000000001','4d000000-0000-0000-0000-000000000002','B');
select ok(not has_function_privilege('anon','public.add_adjustment(uuid,uuid,text,uuid,uuid,numeric,text)','EXECUTE'),'anonymous cannot grant decimal bonuses');
select is(to_regprocedure('public.add_adjustment(uuid,uuid,text,uuid,uuid,integer,text)'),null::regprocedure,'one numeric RPC signature avoids ambiguous overloads');
set local role authenticated;
select set_config('request.jwt.claim.sub','1d000000-0000-0000-0000-000000000001',true);
select is((public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.25,'Decimal bonus')->>'points')::numeric,.25::numeric,'quarter-heart bonus stays exact');
select is((public.add_adjustment('9d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.5,'Decimal bonus')->>'points')::numeric,.5::numeric,'half-heart bonus stays exact');
select is((public.add_adjustment('9d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.5,'Decimal bonus')->>'points')::numeric,.5::numeric,'replay returns the same half-heart receipt');
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,10.75::numeric,'replay does not duplicate the bonus');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.25,'Decimal bonus')$$,'last quarter reaches the exact bonus cap');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.01,'Decimal bonus')$$,'P0001','CAP_EXCEEDED','one hundredth beyond the cap is rejected');
select lives_ok($$select public.revoke_adjustment(gen_random_uuid(),(public.add_adjustment('9d000000-0000-0000-0000-000000000001','3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.5,'Decimal bonus')->>'id')::uuid,'Entered by mistake')$$,'revoking a decimal bonus restores allowance');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.5,'Decimal bonus')$$,'restored half-heart allowance can be consumed');
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,11::numeric,'revoked half is excluded from breakdown');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',-.25,'Decimal bonus')$$,'quarter-heart penalty is separate from bonus allowance');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',-.5,'Decimal bonus')$$,'half-heart penalty is accepted');
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,10.25::numeric,'signed bonuses and penalties preserve exact hearts');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',-.25,'Decimal bonus')$$,'penalties can reach their exact cap');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',-.01,'Decimal bonus')$$,'P0001','CAP_EXCEEDED','penalties cannot exceed their separate cap');
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,10::numeric,'one heart of bonuses and penalties cancel exactly');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',0,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount 0 is rejected');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',.001,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount .001 is rejected');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',-.251,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount -.251 is rejected');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001','NaN'::numeric,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount NaN::numeric is rejected');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001','Infinity'::numeric,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount Infinity::numeric is rejected');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001','-Infinity'::numeric,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount -Infinity::numeric is rejected');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',2147483648,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount 2147483648 is rejected');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000001',-2147483649,'Decimal bonus')$$,'P0001','INVALID_ADJUSTMENT','invalid amount -2147483649 is rejected');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','MATCH','7d000000-0000-0000-0000-000000000001','4d000000-0000-0000-0000-000000000001',.25,'Decimal bonus')$$,'match bonus supports quarter hearts independently');
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,10.25::numeric,'match decimals contribute to public breakdown');
select is((select (x->>'adjustment_points')::numeric from jsonb_array_elements(public.get_standings('3d000000-0000-0000-0000-000000000001')) x where x->'team'->>'code'='T01'),.25::numeric,'standings do not truncate decimal adjustments');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000003',1,'Decimal bonus')$$,'legacy integer RPC calls still work');
select lives_ok($$select public.void_match(gen_random_uuid(),'7d000000-0000-0000-0000-000000000001','Void for testing')$$,'void match retains adjustment history');
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,10::numeric,'void match decimal is excluded from totals');
select throws_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','MATCH','7d000000-0000-0000-0000-000000000001','4d000000-0000-0000-0000-000000000001',.25,'Decimal bonus')$$,'P0001','MATCH_VOID','void match refuses new decimal adjustments');
reset role;
update public.events set scoring_mode='POINTS' where id='3d000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T01')->'breakdown'->>'total')::numeric,0::numeric,'POINTS totals exclude starting hearts and void match bonus');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000002',.1,'Decimal bonus')$$,'POINTS accepts tenths');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000002',.2,'Decimal bonus')$$,'POINTS accepts another tenth-based bonus');
select is((public.get_team_view('3d000000-0000-0000-0000-000000000001','T02')->'breakdown'->>'total')::numeric,.3::numeric,'decimal addition is exact in POINTS mode');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000002',-.3,'Decimal bonus')$$,'signed decimal cancels exact total');
select lives_ok($$select public.set_tiebreak(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001',array['4d000000-0000-0000-0000-000000000001','4d000000-0000-0000-0000-000000000002']::uuid[])$$,'exact decimal totals form a valid tie cohort');
select lives_ok($$select public.add_adjustment(gen_random_uuid(),'3d000000-0000-0000-0000-000000000001','EVENT',null,'4d000000-0000-0000-0000-000000000002',.01,'Decimal bonus')$$,'one hundredth splits the tie');
reset role;
select is((select count(*) from public.teams where event_id='3d000000-0000-0000-0000-000000000001' and final_tiebreak_pos is not null),0::bigint,'decimal scoring changes invalidate prior manual ties');
select * from finish();
rollback;

