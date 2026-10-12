-- Member writes and their audits share a transaction. Auth administration is an
-- external system: persist an intent before calling it, then record the outcome.
create table public.member_admin_operations (
  id uuid primary key,
  actor_id uuid not null references public.members(id),
  member_id uuid not null,
  action text not null check (action in ('create', 'set_password', 'deactivate', 'reactivate', 'change_own_password')),
  status text not null default 'STARTED' check (status in ('STARTED', 'SUCCEEDED', 'FAILED', 'NEEDS_REVIEW')),
  auth_user_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index member_admin_pending on public.member_admin_operations(member_id)
  where status in ('STARTED', 'NEEDS_REVIEW');
alter table public.member_admin_operations enable row level security;
revoke all on public.member_admin_operations from public, anon, authenticated;
grant select on public.member_admin_operations to service_role;

create function public.member_admin_write(p_op_id uuid, p_actor uuid, p_action text, p_member uuid, p_values jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid; v_before jsonb; v_after jsonb; v_action text; v_saved public.client_ops; v_result jsonb;
begin
  select id into v_actor from public.members where auth_user_id = p_actor and is_active and system_role = 'OWNER';
  if v_actor is null then raise exception 'FORBIDDEN'; end if;
  if p_op_id is null or p_member is null then raise exception 'INVALID_REQUEST'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_op_id::text, 0));
  select * into v_saved from public.client_ops where op_id = p_op_id;
  if found then
    if v_saved.actor_id <> v_actor or v_saved.rpc_name <> 'member_admin_' || p_action or v_saved.result->>'id' <> p_member::text or v_saved.result->'values' is distinct from p_values then raise exception 'OP_ID_CONFLICT'; end if;
    return v_saved.result;
  end if;
  -- Never accept credentials or arbitrary columns, even from the Edge adapter.
  if jsonb_typeof(p_values) <> 'object' or exists (select 1 from jsonb_object_keys(p_values) k where k not in ('username', 'phone', 'full_name_en', 'full_name_ar', 'auth_user_id')) then raise exception 'INVALID_MEMBER'; end if;
  if p_action = 'create' then
    insert into public.members(id, username, phone, full_name_en, full_name_ar, created_by)
      values(p_member, p_values->>'username', p_values->>'phone', p_values->>'full_name_en', p_values->>'full_name_ar', v_actor);
    v_action := 'MEMBER_CREATED';
  else
    select jsonb_build_object('username', username, 'phone', phone, 'full_name_en', full_name_en, 'full_name_ar', full_name_ar, 'is_active', is_active, 'auth_user_id', auth_user_id)
      into v_before from public.members where id = p_member for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if p_action = 'update' then
      update public.members set
        username = case when p_values ? 'username' then p_values->>'username' else username end,
        phone = case when p_values ? 'phone' then p_values->>'phone' else phone end,
        full_name_en = case when p_values ? 'full_name_en' then p_values->>'full_name_en' else full_name_en end,
        full_name_ar = case when p_values ? 'full_name_ar' then p_values->>'full_name_ar' else full_name_ar end,
        updated_at = now() where id = p_member;
      v_action := 'MEMBER_UPDATED';
    elsif p_action = 'link' then
      if nullif(p_values->>'auth_user_id', '') is null then raise exception 'INVALID_MEMBER'; end if;
      update public.members set auth_user_id = (p_values->>'auth_user_id')::uuid, updated_at = now() where id = p_member and auth_user_id is null;
      if not found then raise exception 'MEMBER_ALREADY_LINKED'; end if;
      v_action := 'MEMBER_LOGIN_LINKED';
    elsif p_action in ('deactivate', 'reactivate') then
      update public.members set is_active = (p_action = 'reactivate'), updated_at = now() where id = p_member;
      v_action := case when p_action = 'reactivate' then 'MEMBER_REACTIVATED' else 'MEMBER_DEACTIVATED' end;
    else raise exception 'INVALID_ACTION'; end if;
  end if;
  select jsonb_build_object('username', username, 'phone', phone, 'full_name_en', full_name_en, 'full_name_ar', full_name_ar, 'is_active', is_active, 'auth_user_id', auth_user_id)
    into v_after from public.members where id = p_member;
  insert into public.audit_log(actor_id, action, entity, entity_id, before, after)
    values(v_actor, v_action, 'member', p_member, v_before, v_after);
  v_result := jsonb_build_object('id', p_member, 'values', p_values);
  insert into public.client_ops(op_id, actor_id, rpc_name, result) values(p_op_id, v_actor, 'member_admin_' || p_action, v_result);
  return v_result;
end $$;

create function public.member_admin_begin(p_op_id uuid, p_actor uuid, p_member uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid; v_pending uuid;
begin
  if p_action not in ('create', 'set_password', 'deactivate', 'reactivate', 'change_own_password') or p_action is null then raise exception 'INVALID_ACTION'; end if;
  select id into v_actor from public.members
   where auth_user_id = p_actor and is_active
     and ((p_action = 'change_own_password' and id = p_member)
       or (p_action <> 'change_own_password' and system_role = 'OWNER'));
  if v_actor is null then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_member::text, 1));
  select id into v_pending from public.member_admin_operations where member_id = p_member and status in ('STARTED', 'NEEDS_REVIEW');
  if found then return jsonb_build_object('id', v_pending, 'status', 'NEEDS_REVIEW'); end if;
  if p_action <> 'create' and not exists(select 1 from public.members where id = p_member) then raise exception 'NOT_FOUND'; end if;
  insert into public.member_admin_operations(id, actor_id, member_id, action, auth_user_id)
    values(p_op_id, v_actor, p_member, p_action, case when p_action = 'change_own_password' then p_actor end);
  insert into public.audit_log(actor_id, action, entity, entity_id, after)
    values(v_actor, 'MEMBER_AUTH_REQUESTED', 'member', p_member, jsonb_build_object('operation_id', p_op_id, 'action', p_action, 'status', 'STARTED'));
  return jsonb_build_object('id', p_op_id, 'status', 'STARTED');
end $$;

-- Also used by an operator after inspecting a pending operation. Record only
-- fixed reason codes and an Auth ID; never passwords or Auth response bodies.
create function public.member_admin_finish(p_op_id uuid, p_status text, p_auth_user uuid default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_op public.member_admin_operations;
begin
  if p_status not in ('SUCCEEDED', 'FAILED', 'NEEDS_REVIEW') or p_status is null then raise exception 'INVALID_STATUS'; end if;
  if p_reason is not null and p_reason !~ '^[A-Z_]{1,60}$' then raise exception 'INVALID_REASON'; end if;
  select * into v_op from public.member_admin_operations where id = p_op_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_op.status in ('SUCCEEDED', 'FAILED') then
    if v_op.status = p_status then return; end if;
    raise exception 'OP_ALREADY_FINISHED';
  end if;
  if p_status = 'SUCCEEDED' and v_op.action = 'change_own_password' then
    update public.members
       set must_change_password = false, updated_at = now()
     where id = v_op.member_id
       and auth_user_id = coalesce(p_auth_user, v_op.auth_user_id)
       and is_active;
    if not found then raise exception 'MEMBER_NOT_ACTIVE'; end if;
  end if;
  update public.member_admin_operations set status = p_status, auth_user_id = coalesce(p_auth_user, auth_user_id), reason = p_reason, updated_at = now() where id = p_op_id;
  insert into public.audit_log(actor_id, action, entity, entity_id, after)
    values(v_op.actor_id, case
        when p_status = 'SUCCEEDED' and v_op.action = 'set_password' then 'MEMBER_PASSWORD_SET'
        when p_status = 'SUCCEEDED' and v_op.action = 'change_own_password' then 'MEMBER_PASSWORD_CHANGED'
        else 'MEMBER_AUTH_' || p_status end,
      'member', v_op.member_id, jsonb_build_object('operation_id', p_op_id, 'action', v_op.action, 'status', p_status, 'auth_user_id', p_auth_user, 'reason', p_reason));
end $$;

revoke all on function public.member_admin_write(uuid,uuid,text,uuid,jsonb), public.member_admin_begin(uuid,uuid,uuid,text), public.member_admin_finish(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.member_admin_write(uuid,uuid,text,uuid,jsonb), public.member_admin_begin(uuid,uuid,uuid,text), public.member_admin_finish(uuid,text,uuid,text) to service_role;
