-- Duplicate round numbers / team codes / game codes return a friendly code instead of the raw
-- Postgres unique-violation text (seen when adding a round while round 1 already exists).

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
exception when unique_violation then
  perform public.phase2_fail('DUPLICATE_TEAM_CODE');
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
exception when unique_violation then
  perform public.phase2_fail('DUPLICATE_GAME_CODE');
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
exception when unique_violation then
  perform public.phase2_fail('DUPLICATE_ROUND_NUMBER');
end $$;
