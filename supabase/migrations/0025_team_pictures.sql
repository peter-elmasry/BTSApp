-- D059: public team pictures; writes remain scoped to the event's owners/admins.
alter table public.teams add column image_path text;
alter table public.teams add constraint teams_image_path_check check (
  image_path is null or image_path ~* ('^'||event_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')
);
-- Team photos are public WebP assets, while mutations are event-admin scoped.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('team-images','team-images',true,5242880,array['image/webp'])
on conflict (id) do update set name=excluded.name,public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists team_images_public_read on storage.objects;
create policy team_images_public_read on storage.objects for select to public
using (bucket_id='team-images');

drop policy if exists team_images_admin_insert on storage.objects;
create policy team_images_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id='team-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
);

drop policy if exists team_images_admin_update on storage.objects;
create policy team_images_admin_update on storage.objects for update to authenticated
using (
  bucket_id='team-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
)
with check (
  bucket_id='team-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
);

drop policy if exists team_images_admin_delete on storage.objects;
create policy team_images_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id='team-images'
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_admin(split_part(name,'/',1)::uuid) else false end
);


create or replace function public.upsert_team(p_op_id uuid,p_event uuid,p_team jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_id uuid; v_before jsonb; v_result jsonb; v_code text;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_existing:=public.op_result(p_op_id,'upsert_team'); if v_existing is not null then return v_existing; end if;
  perform public.phase2_event_lock(p_event);
  if p_team is null or jsonb_typeof(p_team)<>'object' or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_TEAM'); end if;
  if coalesce((select jsonb_agg(k) from jsonb_object_keys(p_team) k where k not in ('id','code','name_en','name_ar','avatar_key','color_hex','sort_order','image_path')), '[]'::jsonb) <> '[]'::jsonb then perform public.phase2_fail('INVALID_TEAM'); end if;
  v_id:=nullif(p_team->>'id','')::uuid; v_code:=upper(trim(coalesce(p_team->>'code','')));
  if v_code !~ '^T[0-9]{1,3}$' or length(trim(coalesce(p_team->>'name_en','')))=0 or length(trim(p_team->>'name_en'))>80
     or coalesce(p_team->>'avatar_key','') not in ('falcon','lion','fox','owl','eagle','turtle','dolphin','whale','butterfly','horse','star','shield','bolt','mountain','sun','moon','flame','wave','anchor','crown','ball','racket','trophy','compass')
     or coalesce(p_team->>'color_hex','') !~ '^#[0-9A-Fa-f]{6}$'
     or (p_team ? 'sort_order' and coalesce(p_team->>'sort_order','') !~ '^-?[0-9]{1,6}$') then perform public.phase2_fail('INVALID_TEAM'); end if;
  if p_team ? 'image_path' and p_team->'image_path'<>'null'::jsonb and
     (jsonb_typeof(p_team->'image_path')<>'string' or (p_team->>'image_path') !~* ('^'||p_event::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$')) then
    perform public.phase2_fail('INVALID_TEAM');
  end if;
  if v_id is null then
    if exists(select 1 from public.rounds r join public.matches m on m.round_id=r.id where r.event_id=p_event and r.type='OPENING') then
      perform public.phase2_fail('OPENING_MATCH_EXISTS');
    end if;
    insert into public.teams(event_id,code,name_en,name_ar,avatar_key,color_hex,sort_order,image_path)
    values(p_event,v_code,trim(p_team->>'name_en'),nullif(trim(p_team->>'name_ar'),''),p_team->>'avatar_key',upper(p_team->>'color_hex'),coalesce((p_team->>'sort_order')::int,0),nullif(p_team->>'image_path','')) returning id into v_id;
  else
    select to_jsonb(t) into v_before from public.teams t where t.id=v_id and t.event_id=p_event;
    if v_before is null then perform public.phase2_fail('NOT_FOUND'); end if;
    update public.teams set code=v_code,name_en=trim(p_team->>'name_en'),name_ar=nullif(trim(p_team->>'name_ar'),''),avatar_key=p_team->>'avatar_key',color_hex=upper(p_team->>'color_hex'),sort_order=coalesce((p_team->>'sort_order')::int,0),image_path=case when p_team ? 'image_path' then nullif(p_team->>'image_path','') else image_path end where id=v_id;
  end if;
  select jsonb_build_object('id',t.id,'event_id',t.event_id,'code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,'avatar_key',t.avatar_key,'color_hex',t.color_hex,'sort_order',t.sort_order,'image_path',t.image_path) into v_result from public.teams t where t.id=v_id;
  perform public.audit(p_event,case when v_before is null then 'TEAM_CREATED' else 'TEAM_UPDATED' end,'team',v_id,v_before,v_result);
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'upsert_team',v_result);
exception when unique_violation then
  perform public.phase2_fail('DUPLICATE_TEAM_CODE');
end $$;


create or replace function public.phase4_team_json(p_team uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  with g as (
    select jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar)
      || case when e.show_guide_phone then jsonb_build_object('phone',mb.phone) else '{}'::jsonb end as guide,
      mb.full_name_en, mb.username
    from public.teams t
    join public.events e on e.id=t.event_id
    join public.event_roles er on er.event_id=t.event_id and er.team_id=t.id and er.role='GUIDE'
    join public.members mb on mb.id=er.member_id and mb.is_active
    where t.id=p_team
  )
  select jsonb_build_object(
    'id',t.id,'code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,
    'image_path',t.image_path,'avatar_key',t.avatar_key,'color_hex',t.color_hex,'sort_order',t.sort_order,
    'guide',(select guide from g order by full_name_en,username limit 1),
    'guides',coalesce((select jsonb_agg(guide order by full_name_en,username) from g),'[]'::jsonb)
  ) from public.teams t where t.id=p_team
$$;


revoke execute on function public.phase4_team_json(uuid) from public,anon,authenticated;
