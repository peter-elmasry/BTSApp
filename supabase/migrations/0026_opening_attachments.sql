-- D058: one optional public image/PDF for an opening round.
alter table public.rounds add column attachment_path text,
  add column attachment_mime text, add column attachment_title text,
  add column attachment_visible boolean not null default false;
alter table public.rounds add constraint opening_attachment_shape check (
  (attachment_path is null and attachment_mime is null and attachment_title is null and not attachment_visible)
  or (type='OPENING' and attachment_path is not null and attachment_mime is not null
    and char_length(coalesce(attachment_title,''))<=160
    and ((attachment_mime='image/webp' and attachment_path ~* ('^'||event_id::text||'/'||id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'))
      or (attachment_mime='application/pdf' and attachment_path ~* ('^'||event_id::text||'/'||id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'))))
);
-- Check round ownership inside the definer, since clients cannot read domain tables.
create or replace function public.opening_asset_write_allowed(p_name text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select case when p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|pdf)$' then exists(
  select 1 from public.rounds r where r.id=split_part(p_name,'/',2)::uuid
    and r.event_id=split_part(p_name,'/',1)::uuid and r.type='OPENING'
    and public.is_event_admin(r.event_id)
) else false end $$;
revoke execute on function public.opening_asset_write_allowed(text) from public,anon,authenticated;
grant execute on function public.opening_asset_write_allowed(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('opening-attachments','opening-attachments',true,10485760,array['image/webp','application/pdf'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy opening_attachments_public_read on storage.objects for select to public using(bucket_id='opening-attachments');
create policy opening_attachments_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='opening-attachments' and public.opening_asset_write_allowed(name));
create policy opening_attachments_admin_update on storage.objects for update to authenticated
using(bucket_id='opening-attachments' and public.opening_asset_write_allowed(name))
with check(bucket_id='opening-attachments' and public.opening_asset_write_allowed(name));
create policy opening_attachments_admin_delete on storage.objects for delete to authenticated
using(bucket_id='opening-attachments' and public.opening_asset_write_allowed(name));

create or replace function public.set_opening_attachment(p_op_id uuid,p_round uuid,p_path text,p_mime text,p_title text,p_visible boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_round public.rounds; v_before jsonb; v_result jsonb; v_old jsonb;
begin
  select * into v_round from public.rounds where id=p_round;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_round.event_id) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_old:=public.op_result(p_op_id,'set_opening_attachment:'||p_round::text);
  if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(v_round.event_id);
  select * into v_round from public.rounds where id=p_round for update;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if v_round.type<>'OPENING' or p_visible is null or length(coalesce(p_title,''))>160
    or (p_path is not null and (p_mime is null or not (
      (p_mime='image/webp' and p_path ~* ('^'||v_round.event_id::text||'/'||p_round::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'))
      or (p_mime='application/pdf' and p_path ~* ('^'||v_round.event_id::text||'/'||p_round::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'))
    ))) then perform public.phase2_fail('INVALID_ATTACHMENT'); end if;
  v_before:=jsonb_build_object('path',v_round.attachment_path,'mime',v_round.attachment_mime,'title',v_round.attachment_title,'visible',v_round.attachment_visible);
  update public.rounds set attachment_path=p_path,
    attachment_mime=case when p_path is null then null else p_mime end,
    attachment_title=case when p_path is null then null else nullif(trim(p_title),'') end,
    attachment_visible=p_path is not null and p_visible where id=p_round;
  select jsonb_build_object('path',attachment_path,'mime',attachment_mime,'title',attachment_title,'visible',attachment_visible)
    into v_result from public.rounds where id=p_round;
  perform public.audit(v_round.event_id,'OPENING_ATTACHMENT_UPDATED','round',p_round,v_before,v_result);
  perform public.emit(v_round.event_id,'round_changed',jsonb_build_object('roundId',p_round));
  return public.op_complete(p_op_id,'set_opening_attachment:'||p_round::text,v_result);
end $$;
revoke execute on function public.set_opening_attachment(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_opening_attachment(uuid,uuid,text,text,text,boolean) to authenticated,service_role;

create or replace function public.get_bootstrap(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$
begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  return jsonb_build_object(
    'teams',coalesce((select jsonb_agg(public.phase4_team_json(t.id) order by t.sort_order,t.code)
      from public.teams t where t.event_id=p_event),'[]'::jsonb),
    'games',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'code',g.code,'name_en',g.name_en,'name_ar',g.name_ar,
      'location_en',g.location_en,'location_ar',g.location_ar,'image_path',g.image_path,
      'referees',public.phase8_game_referees_json(g.id)
    ) order by g.code) from public.games g where g.event_id=p_event),'[]'::jsonb),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'number',r.number,'type',r.type,'name_en',r.name_en,'name_ar',r.name_ar,
      'duration_min',r.duration_min,'extension_min',r.extension_min,'status',r.status,
      'started_at',r.started_at,'closed_at',r.closed_at,
      'attachment',case when r.type='OPENING' and r.attachment_visible and r.attachment_path is not null
        then jsonb_build_object('path',r.attachment_path,'mime',r.attachment_mime,'title',r.attachment_title) else null end,
      'ends_at',r.started_at+make_interval(mins=>r.duration_min+r.extension_min),
      'is_overtime',r.status='ACTIVE' and r.started_at is not null
        and now()>r.started_at+make_interval(mins=>r.duration_min+r.extension_min),
      -- D041: matches still without a result after the round ended (no outcomes revealed).
      'late_count',case when r.status='CLOSED' then (select count(*) from public.matches m
        where m.round_id=r.id and m.status='SCHEDULED') else 0 end
    ) order by r.number) from public.rounds r where r.event_id=p_event),'[]'::jsonb)
  );
end $$;
