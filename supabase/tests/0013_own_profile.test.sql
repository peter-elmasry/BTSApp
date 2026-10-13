begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

-- D052: members edit their own username, names and mobile number.
insert into auth.users(id) select ('1b000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
insert into public.members(id,auth_user_id,username,phone,full_name_en,is_active) values
('2b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000001','self_one',null,'Self One',true),
('2b000000-0000-0000-0000-000000000002','1b000000-0000-0000-0000-000000000002','self_two','+201011111111','Self Two',true),
('2b000000-0000-0000-0000-000000000003','1b000000-0000-0000-0000-000000000003','self_off',null,'Self Off',false);

set local role anon;
select throws_ok($$select public.update_own_profile(gen_random_uuid(),'x_anon','Anon',null,null)$$,'42501',null,'anonymous visitors cannot edit profiles');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','1b000000-0000-0000-0000-000000000001',true);
select is((public.update_own_profile('9b000000-0000-0000-0000-000000000001','  New.Name ','Self One Edited','سلف','01022223333'))->>'username','new.name','username is trimmed and lower-cased');
select is((public.update_own_profile('9b000000-0000-0000-0000-000000000001','ignored','Ignored',null,null))->>'phone','+201022223333','local Egyptian mobile is stored in international form');
select is((public.update_own_profile('9b000000-0000-0000-0000-000000000001','ignored','Ignored',null,null))->>'full_name_ar','سلف','Arabic name is saved');
select is((public.update_own_profile('9b000000-0000-0000-0000-000000000001','ignored','Ignored',null,null))->>'username','new.name','retrying the same operation returns the first result');
select throws_ok($$select public.update_own_profile(gen_random_uuid(),'self_two','Self One',null,null)$$,'P0001','DUPLICATE_USERNAME','another member''s username is refused');
select throws_ok($$select public.update_own_profile(gen_random_uuid(),'new.name','Self One',null,'+201011111111')$$,'P0001','DUPLICATE_PHONE','another member''s mobile is refused');
select throws_ok($$select public.update_own_profile(gen_random_uuid(),'ab','Self One',null,null)$$,'P0001','INVALID_USERNAME','short usernames are refused');
select throws_ok($$select public.update_own_profile(gen_random_uuid(),'new.name','  ',null,null)$$,'P0001','INVALID_NAME','an empty English name is refused');
select throws_ok($$select public.update_own_profile(gen_random_uuid(),'new.name','Self One',null,'12ab')$$,'P0001','INVALID_PHONE','an invalid mobile is refused');
select is((public.update_own_profile(gen_random_uuid(),'new.name','Self One Edited','سلف',''))->>'phone',null,'clearing the mobile removes it');
select set_config('request.jwt.claim.sub','1b000000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.update_own_profile(gen_random_uuid(),'self_off','Self Off',null,null)$$,'P0001','UNAUTHORIZED','inactive members cannot edit their profile');
reset role;

select is((select count(*)::int from public.members where id='2b000000-0000-0000-0000-000000000002' and username='self_two' and full_name_en='Self Two'),1,'other members are never changed');
select is((select count(*)::int from public.audit_log where action='MEMBER_PROFILE_UPDATED' and entity_id='2b000000-0000-0000-0000-000000000001' and actor_id='2b000000-0000-0000-0000-000000000001'),2,'each real change is audited with the member as actor');

select * from finish();
rollback;
