-- Phase 1: profile reads and owner-only event administration.
create or replace function public.get_my_profile()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_member public.members; v_roles jsonb; v_games jsonb;
begin
  select * into v_member from public.members
   where auth_user_id = auth.uid() and is_active;
  if not found then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('event_id', er.event_id, 'role', er.role, 'team_id', er.team_id) order by er.event_id, er.role), '[]'::jsonb)
    into v_roles from public.event_roles er where er.member_id = v_member.id;
  select coalesce(jsonb_agg(jsonb_build_object('event_id', rg.event_id, 'game_id', rg.game_id) order by rg.event_id, rg.game_id), '[]'::jsonb)
    into v_games from public.referee_games rg where rg.member_id = v_member.id;
  return jsonb_build_object('id', v_member.id, 'username', v_member.username,
    'phone', v_member.phone, 'full_name_en', v_member.full_name_en,
    'full_name_ar', v_member.full_name_ar, 'system_role', v_member.system_role,
    'roles', v_roles, 'assigned_games', v_games);
end $$;

create or replace function public.list_members()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ begin
  if not public.is_owner() then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', m.id, 'username', m.username, 'phone', m.phone,
    'full_name_en', m.full_name_en, 'full_name_ar', m.full_name_ar,
    'system_role', m.system_role, 'is_active', m.is_active,
    'has_login', m.auth_user_id is not null, 'created_at', m.created_at
  ) order by m.username) from public.members m), '[]'::jsonb);
end $$;

create or replace function public.list_events()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ begin
  if not public.is_owner() then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', e.id, 'code', e.code, 'name_en', e.name_en, 'name_ar', e.name_ar,
    'status', e.status, 'is_current', e.is_current, 'starts_on', e.starts_on,
    'admin_ids', coalesce((select jsonb_agg(er.member_id order by er.created_at)
      from public.event_roles er where er.event_id = e.id and er.role = 'EVENT_ADMIN'), '[]'::jsonb)
  ) order by e.created_at desc) from public.events e), '[]'::jsonb);
end $$;

create or replace function public.create_event(
  p_op_id uuid, p_code text, p_name_en text, p_name_ar text default null, p_starts_on date default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_id uuid; v_result jsonb; v_actor uuid := public.current_member_id();
begin
  if not public.is_owner() then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  v_existing := public.op_result(p_op_id, 'create_event'); if v_existing is not null then return v_existing; end if;
  if p_code !~ '^[A-Z0-9][A-Z0-9_-]{1,29}$' or length(trim(p_name_en)) = 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_EVENT';
  end if;
  insert into public.events(code, name_en, name_ar, starts_on, created_by)
   values (p_code, trim(p_name_en), nullif(trim(p_name_ar), ''), p_starts_on, v_actor) returning id into v_id;
  v_result := jsonb_build_object('id', v_id);
  perform public.audit(null, 'EVENT_CREATED', 'event', v_id, null, v_result);
  return public.op_complete(p_op_id, 'create_event', v_result);
end $$;

create or replace function public.set_current_event(p_op_id uuid, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_result jsonb;
begin
  if not public.is_owner() then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  v_existing := public.op_result(p_op_id, 'set_current_event'); if v_existing is not null then return v_existing; end if;
  if not exists(select 1 from public.events where id = p_event) then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  update public.events set is_current = (id = p_event), updated_at = now() where is_current or id = p_event;
  v_result := jsonb_build_object('id', p_event);
  perform public.audit(p_event, 'CURRENT_EVENT_SET', 'event', p_event, null, v_result);
  return public.op_complete(p_op_id, 'set_current_event', v_result);
end $$;

create or replace function public.assign_event_admin(p_op_id uuid, p_event uuid, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_result jsonb; v_actor uuid := public.current_member_id();
begin
  if not public.is_owner() then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  v_existing := public.op_result(p_op_id, 'assign_event_admin'); if v_existing is not null then return v_existing; end if;
  if not exists(select 1 from public.events where id = p_event) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if not exists(select 1 from public.members where id = p_member and is_active and auth_user_id is not null) then
    raise exception using errcode = 'P0001', message = 'MEMBER_NO_LOGIN';
  end if;
  insert into public.event_roles(event_id, member_id, role, created_by)
    values (p_event, p_member, 'EVENT_ADMIN', v_actor) on conflict (event_id, member_id, role) do nothing;
  v_result := jsonb_build_object('event_id', p_event, 'member_id', p_member, 'role', 'EVENT_ADMIN');
  perform public.audit(p_event, 'EVENT_ADMIN_ASSIGNED', 'event_role', null, null, v_result);
  return public.op_complete(p_op_id, 'assign_event_admin', v_result);
end $$;

create or replace function public.remove_event_admin(p_op_id uuid, p_event uuid, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_result jsonb;
begin
  if not public.is_owner() then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  v_existing := public.op_result(p_op_id, 'remove_event_admin'); if v_existing is not null then return v_existing; end if;
  delete from public.event_roles where event_id = p_event and member_id = p_member and role = 'EVENT_ADMIN';
  v_result := jsonb_build_object('event_id', p_event, 'member_id', p_member, 'removed', found);
  perform public.audit(p_event, 'EVENT_ADMIN_REMOVED', 'event_role', null, null, v_result);
  return public.op_complete(p_op_id, 'remove_event_admin', v_result);
end $$;

revoke execute on function public.get_my_profile(), public.list_members(), public.list_events(), public.create_event(uuid,text,text,text,date), public.set_current_event(uuid,uuid), public.assign_event_admin(uuid,uuid,uuid), public.remove_event_admin(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_my_profile(), public.list_members(), public.list_events(), public.create_event(uuid,text,text,text,date), public.set_current_event(uuid,uuid), public.assign_event_admin(uuid,uuid,uuid), public.remove_event_admin(uuid,uuid,uuid) to authenticated;
grant execute on function public.get_my_profile(), public.list_members(), public.list_events(), public.create_event(uuid,text,text,text,date), public.set_current_event(uuid,uuid), public.assign_event_admin(uuid,uuid,uuid), public.remove_event_admin(uuid,uuid,uuid) to service_role;
