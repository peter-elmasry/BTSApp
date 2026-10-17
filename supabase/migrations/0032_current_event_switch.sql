-- A partial unique index is checked row-by-row. A single UPDATE that sets the
-- new event before clearing the old event can violate one_current_event.
create or replace function public.set_current_event(p_op_id uuid, p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_existing jsonb; v_result jsonb;
begin
  if not public.is_owner() then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  -- Serialize switches, including a switch from an empty current selection.
  -- The lock and both writes share the RPC transaction; readers see the switch
  -- only after commit, and a failure restores the previous selection.
  lock table public.events in share row exclusive mode;
  v_existing := public.op_result(p_op_id, 'set_current_event'); if v_existing is not null then return v_existing; end if;
  if not exists(select 1 from public.events where id = p_event) then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  update public.events set is_current = false, updated_at = now() where is_current and id <> p_event;
  update public.events set is_current = true, updated_at = now() where id = p_event;
  v_result := jsonb_build_object('id', p_event);
  perform public.audit(p_event, 'CURRENT_EVENT_SET', 'event', p_event, null, v_result);
  return public.op_complete(p_op_id, 'set_current_event', v_result);
end $$;
