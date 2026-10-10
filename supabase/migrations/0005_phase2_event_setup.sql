-- Phase 2: owner/event-admin setup RPCs. All writes remain behind SECURITY DEFINER.

create or replace function public.phase2_fail(p_code text, p_detail jsonb default null)
returns void language plpgsql immutable set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = 'P0001', message = p_code,
    detail = coalesce(p_detail::text, '');
end $$;

create or replace function public.phase2_event_lock(p_event uuid)
returns void language sql volatile security definer set search_path = public, pg_temp
as $$ select pg_advisory_xact_lock(hashtextextended('phase2:' || p_event::text, 0)) $$;

alter table public.rounds add constraint rounds_number_matches_type
  check ((type='OPENING' and number=0) or (type='REGULAR' and number>0));

create or replace function public.phase2_check_match_scope()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_round_event uuid; v_round_type text; v_game_event uuid;
begin
  select event_id,type into v_round_event,v_round_type from public.rounds where id=new.round_id;
  select event_id into v_game_event from public.games where id=new.game_id;
  if v_round_event is null or v_game_event is null or new.event_id is distinct from v_round_event or new.event_id is distinct from v_game_event then
    raise exception using errcode='P0001',message='EVENT_MISMATCH';
  end if;
  if v_round_type='OPENING' then
    perform public.phase2_event_lock(new.event_id);
    if exists(select 1 from public.matches m where m.round_id=new.round_id and m.id is distinct from new.id) then
      raise exception using errcode='P0001',message='OPENING_MATCH_EXISTS';
    end if;
  end if;
  return new;
end $$;
create trigger phase2_match_scope before insert or update of event_id,round_id,game_id on public.matches
for each row execute function public.phase2_check_match_scope();

create or replace function public.phase2_check_participant_scope()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_event uuid; v_team_event uuid; v_type text;
begin
  select m.event_id,r.type into v_event,v_type from public.matches m join public.rounds r on r.id=m.round_id where m.id=new.match_id and m.round_id=new.round_id;
  select event_id into v_team_event from public.teams where id=new.team_id;
  if v_event is null or v_event is distinct from v_team_event then raise exception using errcode='P0001',message='EVENT_MISMATCH'; end if;
  if (v_type='OPENING' and new.side is not null) or (v_type='REGULAR' and new.side is null) then raise exception using errcode='P0001',message='INVALID_PARTICIPANTS'; end if;
  return new;
end $$;
create trigger phase2_participant_scope before insert or update on public.match_participants
for each row execute function public.phase2_check_participant_scope();

-- Game photos are public WebP assets, while mutations are event-admin scoped.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('game-images','game-images',true,5242880,array['image/webp'])
on conflict (id) do update set name=excluded.name,public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists game_images_public_read on storage.objects;
create policy game_images_public_read on storage.objects for select to public
using (bucket_id='game-images');

drop policy if exists game_images_admin_insert on storage.objects;
create policy game_images_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id='game-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
);

drop policy if exists game_images_admin_update on storage.objects;
create policy game_images_admin_update on storage.objects for update to authenticated
using (
  bucket_id='game-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
)
with check (
  bucket_id='game-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
);

drop policy if exists game_images_admin_delete on storage.objects;
create policy game_images_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id='game-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
);

create or replace function public.get_event_setup(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id = p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  select jsonb_build_object(
    'event', to_jsonb(e),
    'teams', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.code) from public.teams t where t.event_id = p_event), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by g.code) from public.games g where g.event_id = p_event), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(to_jsonb(r) order by r.number) from public.rounds r where r.event_id = p_event), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'event_id', m.event_id, 'round_id', m.round_id, 'game_id', m.game_id, 'status', m.status,
      'participants', coalesce((select jsonb_agg(jsonb_build_object('team_id', mp.team_id, 'side', mp.side) order by mp.side nulls first, t.code)
        from public.match_participants mp join public.teams t on t.id = mp.team_id where mp.match_id = m.id), '[]'::jsonb)
    ) order by r.number, g.code) from public.matches m join public.rounds r on r.id=m.round_id join public.games g on g.id=m.game_id where m.event_id=p_event), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('member_id', er.member_id, 'role', er.role, 'team_id', er.team_id,
      'username', mb.username, 'full_name_en', mb.full_name_en, 'full_name_ar', mb.full_name_ar)
      order by er.role, mb.username) from public.event_roles er join public.members mb on mb.id=er.member_id where er.event_id=p_event), '[]'::jsonb),
    'referee_games', coalesce((select jsonb_agg(jsonb_build_object('member_id', rg.member_id, 'game_id', rg.game_id) order by rg.member_id, rg.game_id)
      from public.referee_games rg where rg.event_id=p_event), '[]'::jsonb),
    'eligible_members', coalesce((select jsonb_agg(jsonb_build_object('id', mb.id, 'username', mb.username,
      'full_name_en', mb.full_name_en, 'full_name_ar', mb.full_name_ar, 'has_login', mb.auth_user_id is not null)
      order by mb.username) from public.members mb where mb.is_active), '[]'::jsonb)
  ) into v_result from public.events e where e.id=p_event;
  return v_result;
end $$;

create or replace function public.upsert_event_settings(p_op_id uuid, p_event uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_old jsonb; v_result jsonb; v_before jsonb; v_key text;
  v_allowed text[] := array['leaderboard_public','show_guide_phone','points_win','points_draw','points_loss',
    'currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural',
    'match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap','name_en','name_ar'];
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_old := public.op_result(p_op_id,'upsert_event_settings'); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if p_settings is null or jsonb_typeof(p_settings)<>'object' or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_SETTINGS'); end if;
  for v_key in select jsonb_object_keys(p_settings) loop
    if not v_key=any(v_allowed) then perform public.phase2_fail('INVALID_SETTINGS', jsonb_build_object('field',v_key)); end if;
  end loop;
  if (p_settings ? 'leaderboard_public' and jsonb_typeof(p_settings->'leaderboard_public') is distinct from 'boolean')
     or (p_settings ? 'show_guide_phone' and jsonb_typeof(p_settings->'show_guide_phone') is distinct from 'boolean') then perform public.phase2_fail('INVALID_SETTINGS'); end if;
  if (p_settings ? 'name_en' and (jsonb_typeof(p_settings->'name_en') is distinct from 'string' or length(trim(p_settings->>'name_en')) not between 1 and 120))
     or (p_settings ? 'name_ar' and p_settings->'name_ar' <> 'null'::jsonb and (jsonb_typeof(p_settings->'name_ar') is distinct from 'string' or length(trim(p_settings->>'name_ar')) > 120)) then
    perform public.phase2_fail('INVALID_SETTINGS',jsonb_build_object('fields',jsonb_build_array('name_en','name_ar')));
  end if;
  if exists(select 1 from unnest(array['points_win','points_draw','points_loss']) k where p_settings ? k and (jsonb_typeof(p_settings->k) is distinct from 'number' or p_settings->>k !~ '^[0-9]{1,6}$'))
     or exists(select 1 from unnest(array['match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap']) k where p_settings ? k and p_settings->k <> 'null'::jsonb and (jsonb_typeof(p_settings->k) is distinct from 'number' or p_settings->>k !~ '^[0-9]{1,6}$'))
     or exists(select 1 from unnest(array['currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural']) k where p_settings ? k and (jsonb_typeof(p_settings->k)<>'string' or length(trim(p_settings->>k)) not between 1 and 40)) then perform public.phase2_fail('INVALID_SETTINGS'); end if;
  select to_jsonb(e) into v_before from public.events e where e.id=p_event;
  update public.events set
    name_en = case when p_settings ? 'name_en' then trim(p_settings->>'name_en') else name_en end,
    name_ar = case when p_settings ? 'name_ar' then nullif(trim(p_settings->>'name_ar'),'') else name_ar end,
    leaderboard_public = case when p_settings ? 'leaderboard_public' then (p_settings->>'leaderboard_public')::boolean else leaderboard_public end,
    show_guide_phone = case when p_settings ? 'show_guide_phone' then (p_settings->>'show_guide_phone')::boolean else show_guide_phone end,
    points_win = case when p_settings ? 'points_win' then (p_settings->>'points_win')::int else points_win end,
    points_draw = case when p_settings ? 'points_draw' then (p_settings->>'points_draw')::int else points_draw end,
    points_loss = case when p_settings ? 'points_loss' then (p_settings->>'points_loss')::int else points_loss end,
    currency_en_one = case when p_settings ? 'currency_en_one' then p_settings->>'currency_en_one' else currency_en_one end,
    currency_en_other = case when p_settings ? 'currency_en_other' then p_settings->>'currency_en_other' else currency_en_other end,
    currency_ar_one = case when p_settings ? 'currency_ar_one' then p_settings->>'currency_ar_one' else currency_ar_one end,
    currency_ar_two = case when p_settings ? 'currency_ar_two' then p_settings->>'currency_ar_two' else currency_ar_two end,
    currency_ar_plural = case when p_settings ? 'currency_ar_plural' then p_settings->>'currency_ar_plural' else currency_ar_plural end,
    match_bonus_cap = case when p_settings ? 'match_bonus_cap' then (p_settings->>'match_bonus_cap')::int else match_bonus_cap end,
    match_penalty_cap = case when p_settings ? 'match_penalty_cap' then (p_settings->>'match_penalty_cap')::int else match_penalty_cap end,
    event_bonus_cap = case when p_settings ? 'event_bonus_cap' then (p_settings->>'event_bonus_cap')::int else event_bonus_cap end,
    event_penalty_cap = case when p_settings ? 'event_penalty_cap' then (p_settings->>'event_penalty_cap')::int else event_penalty_cap end,
    updated_at=now() where id=p_event;
  select jsonb_build_object('event_id',e.id,'settings',jsonb_build_object('name_en',e.name_en,'name_ar',e.name_ar,'leaderboard_public',e.leaderboard_public,'show_guide_phone',e.show_guide_phone,
    'points_win',e.points_win,'points_draw',e.points_draw,'points_loss',e.points_loss,'currency_en_one',e.currency_en_one,'currency_en_other',e.currency_en_other,
    'currency_ar_one',e.currency_ar_one,'currency_ar_two',e.currency_ar_two,'currency_ar_plural',e.currency_ar_plural,'match_bonus_cap',e.match_bonus_cap,
    'match_penalty_cap',e.match_penalty_cap,'event_bonus_cap',e.event_bonus_cap,'event_penalty_cap',e.event_penalty_cap)) into v_result from public.events e where e.id=p_event;
  perform public.audit(p_event,'EVENT_SETTINGS_UPDATED','event',p_event,v_before,v_result);
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'upsert_event_settings',v_result);
end $$;

create or replace function public.upsert_team(p_op_id uuid,p_event uuid,p_team jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_id uuid; v_before jsonb; v_result jsonb; v_code text;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'upsert_team'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(p_event);
  if p_team is null or jsonb_typeof(p_team)<>'object' or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_TEAM'); end if;
  if coalesce((select jsonb_agg(k) from jsonb_object_keys(p_team) k where k not in ('id','code','name_en','name_ar','avatar_key','color_hex','sort_order')), '[]'::jsonb) <> '[]'::jsonb then perform public.phase2_fail('INVALID_TEAM'); end if;
  v_id:=nullif(p_team->>'id','')::uuid; v_code:=upper(trim(coalesce(p_team->>'code','')));
  if v_code !~ '^T[0-9]{1,3}$' or length(trim(coalesce(p_team->>'name_en','')))=0 or length(trim(p_team->>'name_en'))>80
     or coalesce(p_team->>'avatar_key','') not in ('falcon','lion','fox','owl','eagle','turtle','dolphin','whale','butterfly','horse','star','shield','bolt','mountain','sun','moon','flame','wave','anchor','crown','ball','racket','trophy','compass')
     or coalesce(p_team->>'color_hex','') !~ '^#[0-9A-Fa-f]{6}$'
     or (p_team ? 'sort_order' and coalesce(p_team->>'sort_order','') !~ '^-?[0-9]{1,6}$') then perform public.phase2_fail('INVALID_TEAM'); end if;
  if v_id is null then
    if exists(select 1 from public.rounds r join public.matches m on m.round_id=r.id where r.event_id=p_event and r.type='OPENING') then
      perform public.phase2_fail('OPENING_MATCH_EXISTS');
    end if;
    insert into public.teams(event_id,code,name_en,name_ar,avatar_key,color_hex,sort_order)
    values(p_event,v_code,trim(p_team->>'name_en'),nullif(trim(p_team->>'name_ar'),''),p_team->>'avatar_key',upper(p_team->>'color_hex'),coalesce((p_team->>'sort_order')::int,0)) returning id into v_id;
  else
    select to_jsonb(t) into v_before from public.teams t where t.id=v_id and t.event_id=p_event;
    if v_before is null then perform public.phase2_fail('NOT_FOUND'); end if;
    update public.teams set code=v_code,name_en=trim(p_team->>'name_en'),name_ar=nullif(trim(p_team->>'name_ar'),''),avatar_key=p_team->>'avatar_key',color_hex=upper(p_team->>'color_hex'),sort_order=coalesce((p_team->>'sort_order')::int,0) where id=v_id;
  end if;
  select jsonb_build_object('id',t.id,'event_id',t.event_id,'code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,'avatar_key',t.avatar_key,'color_hex',t.color_hex,'sort_order',t.sort_order) into v_result from public.teams t where t.id=v_id;
  perform public.audit(p_event,case when v_before is null then 'TEAM_CREATED' else 'TEAM_UPDATED' end,'team',v_id,v_before,v_result);
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'upsert_team',v_result);
end $$;

create or replace function public.delete_team(p_op_id uuid,p_team uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_event uuid; v_before jsonb; v_result jsonb;
begin
  v_existing:=public.op_result(p_op_id,'delete_team'); if v_existing is not null then return v_existing; end if;
  select event_id,to_jsonb(t) into v_event,v_before from public.teams t where id=p_team;
  if v_event is null or not public.is_event_admin(v_event) then perform public.phase2_fail(case when v_event is null then 'NOT_FOUND' else 'FORBIDDEN' end); end if;
  perform public.phase2_event_lock(v_event);
  if exists(select 1 from public.match_participants where team_id=p_team) then perform public.phase2_fail('TEAM_IN_USE'); end if;
  if exists(select 1 from public.event_roles where event_id=v_event and team_id=p_team and role='GUIDE') then perform public.phase2_fail('TEAM_IN_USE'); end if;
  delete from public.teams where id=p_team;
  v_result:=jsonb_build_object('id',p_team,'deleted',true);
  perform public.audit(v_event,'TEAM_DELETED','team',p_team,v_before,v_result); perform public.emit(v_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'delete_team',v_result);
end $$;

create or replace function public.upsert_game(p_op_id uuid,p_event uuid,p_game jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_id uuid; v_before jsonb; v_result jsonb; v_code text;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'upsert_game'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(p_event);
  if p_game is null or jsonb_typeof(p_game)<>'object' or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_GAME'); end if;
  if exists(select 1 from jsonb_object_keys(p_game) k where k not in ('id','code','name_en','name_ar','location_en','location_ar','image_path')) then perform public.phase2_fail('INVALID_GAME'); end if;
  v_id:=nullif(p_game->>'id','')::uuid; v_code:=upper(trim(coalesce(p_game->>'code','')));
  if v_code !~ '^G[0-9]{1,3}$' or length(trim(coalesce(p_game->>'name_en','')))=0 or length(trim(p_game->>'name_en'))>100
     or length(coalesce(p_game->>'location_en',''))>120 or length(coalesce(p_game->>'location_ar',''))>120
     or (p_game ? 'image_path' and nullif(p_game->>'image_path','') is not null and (p_game->>'image_path') !~* ('^'||p_event::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')) then perform public.phase2_fail('INVALID_GAME'); end if;
  if v_id is null then
    insert into public.games(event_id,code,name_en,name_ar,location_en,location_ar,image_path) values(p_event,v_code,trim(p_game->>'name_en'),nullif(trim(p_game->>'name_ar'),''),nullif(trim(p_game->>'location_en'),''),nullif(trim(p_game->>'location_ar'),''),nullif(p_game->>'image_path','')) returning id into v_id;
  else
    select to_jsonb(g) into v_before from public.games g where g.id=v_id and g.event_id=p_event;
    if v_before is null then perform public.phase2_fail('NOT_FOUND'); end if;
    update public.games set code=v_code,name_en=trim(p_game->>'name_en'),name_ar=nullif(trim(p_game->>'name_ar'),''),location_en=nullif(trim(p_game->>'location_en'),''),location_ar=nullif(trim(p_game->>'location_ar'),''),image_path=nullif(p_game->>'image_path','') where id=v_id;
  end if;
  select to_jsonb(g) into v_result from public.games g where g.id=v_id;
  perform public.audit(p_event,case when v_before is null then 'GAME_CREATED' else 'GAME_UPDATED' end,'game',v_id,v_before,v_result);
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'upsert_game',v_result);
end $$;

create or replace function public.delete_game(p_op_id uuid,p_game uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_event uuid; v_before jsonb; v_result jsonb;
begin
  v_existing:=public.op_result(p_op_id,'delete_game'); if v_existing is not null then return v_existing; end if;
  select event_id,to_jsonb(g) into v_event,v_before from public.games g where id=p_game;
  if v_event is null or not public.is_event_admin(v_event) then perform public.phase2_fail(case when v_event is null then 'NOT_FOUND' else 'FORBIDDEN' end); end if;
  perform public.phase2_event_lock(v_event);
  if exists(select 1 from public.matches where game_id=p_game) then perform public.phase2_fail('GAME_IN_USE'); end if;
  delete from public.games where id=p_game; v_result:=jsonb_build_object('id',p_game,'deleted',true);
  perform public.audit(v_event,'GAME_DELETED','game',p_game,v_before,v_result); perform public.emit(v_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'delete_game',v_result);
end $$;

create or replace function public.upsert_round(p_op_id uuid,p_event uuid,p_round jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_id uuid; v_before jsonb; v_result jsonb; v_number int; v_type text; v_duration int;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'upsert_round'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(p_event);
  if p_round is null or jsonb_typeof(p_round)<>'object' or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_ROUND'); end if;
  if exists(select 1 from jsonb_object_keys(p_round) k where k not in ('id','number','type','name_en','name_ar','duration_min')) then perform public.phase2_fail('INVALID_ROUND'); end if;
  v_id:=nullif(p_round->>'id','')::uuid; v_number:=case when coalesce(p_round->>'number','') ~ '^[0-9]{1,3}$' then (p_round->>'number')::int else -1 end;
  v_type:=upper(coalesce(p_round->>'type','REGULAR')); v_duration:=case when coalesce(p_round->>'duration_min','') ~ '^[0-9]{1,3}$' then (p_round->>'duration_min')::int else -1 end;
  if v_type not in ('REGULAR','OPENING') or v_duration not between 1 and 600 or length(coalesce(p_round->>'name_en',''))>100
     or (v_type='OPENING' and v_number<>0) or (v_type='REGULAR' and v_number<1) then perform public.phase2_fail('INVALID_ROUND'); end if;
  if v_id is null then
    insert into public.rounds(event_id,number,type,name_en,name_ar,duration_min) values(p_event,v_number,v_type,nullif(trim(p_round->>'name_en'),''),nullif(trim(p_round->>'name_ar'),''),v_duration) returning id into v_id;
  else
    select to_jsonb(r) into v_before from public.rounds r where r.id=v_id and r.event_id=p_event;
    if v_before is null then perform public.phase2_fail('NOT_FOUND'); end if;
    if exists(select 1 from public.rounds where id=v_id and status<>'DRAFT') then perform public.phase2_fail('ROUND_NOT_DRAFT'); end if;
    if ((v_before->>'number')::int is distinct from v_number or v_before->>'type' is distinct from v_type)
       and exists(select 1 from public.matches where round_id=v_id) then perform public.phase2_fail('ROUND_IN_USE'); end if;
    update public.rounds set number=v_number,type=v_type,name_en=nullif(trim(p_round->>'name_en'),''),name_ar=nullif(trim(p_round->>'name_ar'),''),duration_min=v_duration where id=v_id;
  end if;
  select to_jsonb(r) into v_result from public.rounds r where r.id=v_id;
  perform public.audit(p_event,case when v_before is null then 'ROUND_CREATED' else 'ROUND_UPDATED' end,'round',v_id,v_before,v_result);
  perform public.emit(p_event,'round_changed',jsonb_build_object('roundId',v_id));
  return public.op_complete(p_op_id,'upsert_round',v_result);
end $$;

create or replace function public.delete_round(p_op_id uuid,p_round uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_event uuid; v_before jsonb; v_result jsonb;
begin
  v_existing:=public.op_result(p_op_id,'delete_round'); if v_existing is not null then return v_existing; end if;
  select event_id,to_jsonb(r) into v_event,v_before from public.rounds r where id=p_round;
  if v_event is null or not public.is_event_admin(v_event) then perform public.phase2_fail(case when v_event is null then 'NOT_FOUND' else 'FORBIDDEN' end); end if;
  perform public.phase2_event_lock(v_event);
  if exists(select 1 from public.rounds where id=p_round and status<>'DRAFT') then perform public.phase2_fail('ROUND_NOT_DRAFT'); end if;
  if exists(select 1 from public.matches where round_id=p_round and status<>'SCHEDULED') then perform public.phase2_fail('ROUND_IN_USE'); end if;
  delete from public.rounds where id=p_round; v_result:=jsonb_build_object('id',p_round,'deleted',true);
  perform public.audit(v_event,'ROUND_DELETED','round',p_round,v_before,v_result); perform public.emit(v_event,'round_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'delete_round',v_result);
end $$;

create or replace function public.upsert_match(p_op_id uuid,p_round uuid,p_game uuid,p_team_codes text[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_event uuid; v_game_event uuid; v_round public.rounds; v_match uuid; v_before jsonb; v_result jsonb; v_team_ids uuid[];
begin
  select event_id into v_event from public.rounds where id=p_round;
  select event_id into v_game_event from public.games where id=p_game;
  if v_event is null or v_game_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'upsert_match'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(v_event);
  if v_event<>v_game_event then perform public.phase2_fail('EVENT_MISMATCH'); end if;
  select * into v_round from public.rounds where id=p_round;
  if v_round.type<>'REGULAR' then perform public.phase2_fail('INVALID_MATCH'); end if;
  if p_team_codes is null or cardinality(p_team_codes)<>2 or p_team_codes[1]=p_team_codes[2] then perform public.phase2_fail('INVALID_PARTICIPANTS'); end if;
  select array_agg(id order by code) into v_team_ids from public.teams where event_id=v_event and upper(code)=any(array(select upper(x) from unnest(p_team_codes) x));
  if coalesce(cardinality(v_team_ids),0)<>2 then perform public.phase2_fail('INVALID_PARTICIPANTS'); end if;
  select id,to_jsonb(m) into v_match,v_before from public.matches m where round_id=p_round and game_id=p_game;
  if v_match is null and v_round.status<>'DRAFT' then perform public.phase2_fail('ROUND_NOT_DRAFT'); end if;
  if v_match is not null and exists(select 1 from public.matches where id=v_match and status<>'SCHEDULED') then perform public.phase2_fail('MATCH_NOT_SCHEDULED'); end if;
  if exists(select 1 from public.match_participants where round_id=p_round and team_id=any(v_team_ids) and match_id is distinct from v_match) then perform public.phase2_fail('TEAM_ALREADY_SCHEDULED'); end if;
  if v_match is null then insert into public.matches(event_id,round_id,game_id) values(v_event,p_round,p_game) returning id into v_match;
  else delete from public.match_participants where match_id=v_match; end if;
  insert into public.match_participants(match_id,round_id,team_id,side)
   select v_match,p_round,t.id,case when t.code=upper(p_team_codes[1]) then 'A' else 'B' end from public.teams t where t.id=any(v_team_ids);
  v_result:=jsonb_build_object('id',v_match,'event_id',v_event,'round_id',p_round,'game_id',p_game,'status','SCHEDULED',
    'participants',(select jsonb_agg(jsonb_build_object('team_id',mp.team_id,'side',mp.side,'code',t.code) order by mp.side) from public.match_participants mp join public.teams t on t.id=mp.team_id where mp.match_id=v_match));
  perform public.audit(v_event,case when v_before is null then 'MATCH_CREATED' else 'MATCH_UPDATED' end,'match',v_match,v_before,v_result);
  perform public.emit(v_event,'match_changed',jsonb_build_object('matchId',v_match,'roundId',p_round));
  return public.op_complete(p_op_id,'upsert_match',v_result);
end $$;

create or replace function public.delete_match(p_op_id uuid,p_match uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_event uuid; v_round uuid; v_before jsonb; v_result jsonb;
begin
  v_existing:=public.op_result(p_op_id,'delete_match'); if v_existing is not null then return v_existing; end if;
  select event_id,round_id,to_jsonb(m) into v_event,v_round,v_before from public.matches m where id=p_match;
  if v_event is null or not public.is_event_admin(v_event) then perform public.phase2_fail(case when v_event is null then 'NOT_FOUND' else 'FORBIDDEN' end); end if;
  perform public.phase2_event_lock(v_event);
  if exists(select 1 from public.matches where id=p_match and status<>'SCHEDULED') then perform public.phase2_fail('MATCH_NOT_SCHEDULED'); end if;
  delete from public.matches where id=p_match; v_result:=jsonb_build_object('id',p_match,'deleted',true);
  perform public.audit(v_event,'MATCH_DELETED','match',p_match,v_before,v_result); perform public.emit(v_event,'match_changed',jsonb_build_object('matchId',p_match,'roundId',v_round));
  return public.op_complete(p_op_id,'delete_match',v_result);
end $$;

create or replace function public.generate_opening_match(p_op_id uuid,p_round uuid,p_game uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_event uuid; v_game_event uuid; v_match uuid; v_before jsonb; v_result jsonb;
begin
  select event_id into v_event from public.rounds where id=p_round and type='OPENING' and number=0;
  select event_id into v_game_event from public.games where id=p_game;
  if v_event is null or v_game_event is null then perform public.phase2_fail('INVALID_OPENING_ROUND'); end if;
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'generate_opening_match'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(v_event);
  if v_event<>v_game_event then perform public.phase2_fail('EVENT_MISMATCH'); end if;
  if (select count(*) from public.teams where event_id=v_event)<2 then perform public.phase2_fail('NOT_ENOUGH_TEAMS'); end if;
  if exists(select 1 from public.matches where round_id=p_round and game_id<>p_game) then perform public.phase2_fail('OPENING_MATCH_EXISTS'); end if;
  select id,to_jsonb(m) into v_match,v_before from public.matches m where round_id=p_round and game_id=p_game;
  if v_match is not null then
    if exists(select 1 from public.matches where id=v_match and status<>'SCHEDULED') then perform public.phase2_fail('MATCH_NOT_SCHEDULED'); end if;
    delete from public.match_participants where match_id=v_match;
  else
    if exists(select 1 from public.rounds where id=p_round and status<>'DRAFT') then perform public.phase2_fail('ROUND_NOT_DRAFT'); end if;
    insert into public.matches(event_id,round_id,game_id) values(v_event,p_round,p_game) returning id into v_match;
  end if;
  insert into public.match_participants(match_id,round_id,team_id,side)
   select v_match,p_round,id,null from public.teams where event_id=v_event;
  v_result:=jsonb_build_object('id',v_match,'event_id',v_event,'round_id',p_round,'game_id',p_game,'status','SCHEDULED',
    'participants',(select jsonb_agg(jsonb_build_object('team_id',mp.team_id,'code',t.code) order by t.code) from public.match_participants mp join public.teams t on t.id=mp.team_id where mp.match_id=v_match));
  perform public.audit(v_event,case when v_before is null then 'OPENING_MATCH_GENERATED' else 'OPENING_MATCH_REGENERATED' end,'match',v_match,v_before,v_result);
  perform public.emit(v_event,'match_changed',jsonb_build_object('matchId',v_match,'roundId',p_round));
  return public.op_complete(p_op_id,'generate_opening_match',v_result);
end $$;

create or replace function public.set_event_role(p_op_id uuid,p_event uuid,p_member uuid,p_role text,p_team uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_result jsonb; v_before jsonb; v_actor uuid:=public.current_member_id();
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'set_event_role'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(p_event);
  if p_role is null or p_role not in ('EVENT_ADMIN','REFEREE','GUIDE') or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_ROLE'); end if;
  if p_role='EVENT_ADMIN' and not public.is_owner() then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.members where id=p_member and is_active and (p_role not in ('REFEREE','EVENT_ADMIN') or auth_user_id is not null)) then perform public.phase2_fail('MEMBER_NOT_ELIGIBLE'); end if;
  if (p_role='GUIDE')<>(p_team is not null) or (p_team is not null and not exists(select 1 from public.teams where id=p_team and event_id=p_event)) then perform public.phase2_fail('INVALID_ROLE'); end if;
  select to_jsonb(er) into v_before from public.event_roles er where event_id=p_event and member_id=p_member and role=p_role;
  begin
    insert into public.event_roles(event_id,member_id,role,team_id,created_by) values(p_event,p_member,p_role,p_team,v_actor)
      on conflict(event_id,member_id,role) do update set team_id=excluded.team_id,created_by=excluded.created_by;
  exception when unique_violation then
    perform public.phase2_fail('TEAM_HAS_GUIDE');
  end;
  v_result:=jsonb_build_object('event_id',p_event,'member_id',p_member,'role',p_role,'team_id',p_team);
  perform public.audit(p_event,case when v_before is null then 'EVENT_ROLE_ASSIGNED' else 'EVENT_ROLE_UPDATED' end,'event_role',null,v_before,v_result);
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'set_event_role',v_result);
end $$;

create or replace function public.remove_event_role(p_op_id uuid,p_event uuid,p_member uuid,p_role text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_before jsonb; v_result jsonb;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'remove_event_role'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(p_event);
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  if p_role not in ('EVENT_ADMIN','REFEREE','GUIDE') then perform public.phase2_fail('INVALID_ROLE'); end if;
  if p_role='EVENT_ADMIN' and not public.is_owner() then perform public.phase2_fail('FORBIDDEN'); end if;
  select to_jsonb(er) into v_before from public.event_roles er where event_id=p_event and member_id=p_member and role=p_role;
  delete from public.event_roles where event_id=p_event and member_id=p_member and role=p_role;
  if p_role='REFEREE' then delete from public.referee_games where event_id=p_event and member_id=p_member; end if;
  v_result:=jsonb_build_object('event_id',p_event,'member_id',p_member,'role',p_role,'removed',v_before is not null);
  perform public.audit(p_event,'EVENT_ROLE_REMOVED','event_role',null,v_before,v_result); perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'remove_event_role',v_result);
end $$;

create or replace function public.set_referee_games(p_op_id uuid,p_event uuid,p_member uuid,p_game_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_old jsonb; v_result jsonb;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'set_referee_games'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(p_event);
  if not exists(select 1 from public.event_roles where event_id=p_event and member_id=p_member and role='REFEREE') then perform public.phase2_fail('MEMBER_NOT_REFEREE'); end if;
  if p_game_ids is null or cardinality(p_game_ids)<>(select count(distinct x) from unnest(p_game_ids) x)
     or exists(select 1 from unnest(p_game_ids) x left join public.games g on g.id=x and g.event_id=p_event where g.id is null) then perform public.phase2_fail('INVALID_GAMES'); end if;
  select coalesce(jsonb_agg(game_id order by game_id),'[]'::jsonb) into v_old from public.referee_games where event_id=p_event and member_id=p_member;
  delete from public.referee_games where event_id=p_event and member_id=p_member;
  insert into public.referee_games(event_id,member_id,game_id) select p_event,p_member,x from unnest(p_game_ids) x;
  v_result:=jsonb_build_object('event_id',p_event,'member_id',p_member,'game_ids',to_jsonb(p_game_ids));
  perform public.audit(p_event,'REFEREE_GAMES_SET','referee_games',null,v_old,v_result); perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'set_referee_games',v_result);
end $$;

-- The RPCs are the only client write path. No setup data read is available to anon.
revoke execute on function public.phase2_fail(text,jsonb), public.phase2_event_lock(uuid),
  public.get_event_setup(uuid), public.upsert_event_settings(uuid,uuid,jsonb), public.upsert_team(uuid,uuid,jsonb), public.delete_team(uuid,uuid),
  public.upsert_game(uuid,uuid,jsonb), public.delete_game(uuid,uuid), public.upsert_round(uuid,uuid,jsonb), public.delete_round(uuid,uuid),
  public.upsert_match(uuid,uuid,uuid,text[]), public.delete_match(uuid,uuid), public.generate_opening_match(uuid,uuid,uuid),
  public.set_event_role(uuid,uuid,uuid,text,uuid), public.remove_event_role(uuid,uuid,uuid,text), public.set_referee_games(uuid,uuid,uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.get_event_setup(uuid), public.upsert_event_settings(uuid,uuid,jsonb), public.upsert_team(uuid,uuid,jsonb), public.delete_team(uuid,uuid),
  public.upsert_game(uuid,uuid,jsonb), public.delete_game(uuid,uuid), public.upsert_round(uuid,uuid,jsonb), public.delete_round(uuid,uuid),
  public.upsert_match(uuid,uuid,uuid,text[]), public.delete_match(uuid,uuid), public.generate_opening_match(uuid,uuid,uuid),
  public.set_event_role(uuid,uuid,uuid,text,uuid), public.remove_event_role(uuid,uuid,uuid,text), public.set_referee_games(uuid,uuid,uuid,uuid[])
  to authenticated;
grant execute on function public.get_event_setup(uuid), public.upsert_event_settings(uuid,uuid,jsonb), public.upsert_team(uuid,uuid,jsonb), public.delete_team(uuid,uuid),
  public.upsert_game(uuid,uuid,jsonb), public.delete_game(uuid,uuid), public.upsert_round(uuid,uuid,jsonb), public.delete_round(uuid,uuid),
  public.upsert_match(uuid,uuid,uuid,text[]), public.delete_match(uuid,uuid), public.generate_opening_match(uuid,uuid,uuid),
  public.set_event_role(uuid,uuid,uuid,text,uuid), public.remove_event_role(uuid,uuid,uuid,text), public.set_referee_games(uuid,uuid,uuid,uuid[])
  to service_role;
