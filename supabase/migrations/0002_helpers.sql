create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select id from public.members where auth_user_id = auth.uid() and is_active $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.members where id = public.current_member_id() and system_role = 'OWNER') $$;

create or replace function public.is_event_admin(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.is_owner() or exists(select 1 from public.event_roles where event_id = p_event and member_id = public.current_member_id() and role = 'EVENT_ADMIN') $$;

create or replace function public.is_referee_for_match(p_match uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (
  select 1 from public.matches m
  join public.referee_games rg on rg.event_id = m.event_id and rg.game_id = m.game_id
  join public.event_roles er on er.event_id = rg.event_id and er.member_id = rg.member_id and er.role = 'REFEREE'
  where m.id = p_match and rg.member_id = public.current_member_id()
) $$;

create or replace function public.is_staff(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.is_owner() or exists(select 1 from public.event_roles where event_id = p_event and member_id = public.current_member_id() and role in ('EVENT_ADMIN', 'REFEREE')) $$;

-- Explicit matrix §2.3 prevails over the conflicting helper sketch (§5.2).
create or replace function public.can_see_results(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.events where id = p_event and (leaderboard_public or public.is_event_admin(p_event))) $$;

create or replace function public.server_now() returns timestamptz
language sql volatile set search_path = public, pg_temp
as $$ select clock_timestamp() $$;

-- Stateless Auth hook: no SMTP/recovery/magic-link delivery. Password sign-in
-- remains available for confirmed synthetic-email accounts created by owners.
create or replace function public.block_auth_email(event jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp
as $$ select '{"error":{"http_code":403,"message":"EMAIL_DISABLED"}}'::jsonb $$;

create or replace function public.audit(p_event uuid, p_action text, p_entity text, p_entity_id uuid, p_before jsonb, p_after jsonb) returns void
language sql security definer set search_path = public, pg_temp
as $$ insert into public.audit_log(event_id, actor_id, action, entity, entity_id, before, after)
values(p_event, public.current_member_id(), p_action, p_entity, p_entity_id, p_before, p_after) $$;

create or replace function public.emit(p_event uuid, p_type text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_type not in ('round_changed','match_changed','adjustment_changed','settings_changed','roster_changed')
     or jsonb_typeof(p_payload) <> 'object' or p_payload is null then
    raise exception using errcode = 'P0001', message = 'INVALID_SIGNAL';
  end if;
  -- Whitelist even for internal callers: never broadcast result data.
  perform realtime.send(
    jsonb_strip_nulls(jsonb_build_object('type', p_type, 'matchId', (p_payload->>'matchId')::uuid, 'roundId', (p_payload->>'roundId')::uuid)),
    p_type, 'event:' || p_event::text, false);
end $$;

-- Future mutation RPCs call this AFTER checking current permissions.
-- Transaction-scoped lock serializes concurrent retries; no reservation survives rollback.
create or replace function public.op_result(p_op_id uuid, p_rpc_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_op public.client_ops; v_actor uuid := public.current_member_id();
begin
  if v_actor is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  if p_op_id is null then raise exception using errcode = 'P0001', message = 'INVALID_OP_ID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_op_id::text, 0));
  select * into v_op from public.client_ops where op_id = p_op_id;
  if found then
    if v_op.actor_id is distinct from v_actor or v_op.rpc_name is distinct from p_rpc_name then
      raise exception using errcode = 'P0001', message = 'OP_ID_CONFLICT';
    end if;
    return v_op.result;
  end if;
  return null;
end $$;

create or replace function public.op_complete(p_op_id uuid, p_rpc_name text, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_previous jsonb;
begin
  v_previous := public.op_result(p_op_id, p_rpc_name);
  if v_previous is not null then return v_previous; end if;
  if p_result is null then raise exception using errcode = 'P0001', message = 'INVALID_OP_RESULT'; end if;
  insert into public.client_ops(op_id, actor_id, rpc_name, result)
  values(p_op_id, public.current_member_id(), p_rpc_name, p_result);
  return p_result;
end $$;
