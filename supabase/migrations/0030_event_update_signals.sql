-- Current-event changes must notify viewers still following the previous event.
-- Cheap recovery token: no rows, results, names or private audit contents.
create function public.get_event_update_token(p_event uuid default null) returns text
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select id::text from public.events where is_current),'none') || ':' ||
    coalesce((select max(id)::text from public.audit_log where event_id=p_event),'0') || ':' ||
    coalesce((select max(id)::text from public.audit_log where event_id is null),'0') || ':' ||
    (select count(*)::text from public.audit_log where event_id is null)
$$;
revoke execute on function public.get_event_update_token(uuid) from public;
grant execute on function public.get_event_update_token(uuid) to anon,authenticated,service_role;

create function public.signal_current_event_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.is_current is distinct from new.is_current then
    perform public.emit(new.id,'settings_changed','{}'::jsonb);
  end if;
  return new;
end $$;
revoke execute on function public.signal_current_event_change() from public,anon,authenticated;
create trigger current_event_changed after update of is_current on public.events
for each row execute function public.signal_current_event_change();

-- Owner-assigned administrators use the same roster signal as other event roles.
create function public.signal_admin_assignment_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(new.role,old.role)='EVENT_ADMIN' then
    perform public.emit(coalesce(new.event_id,old.event_id),'roster_changed','{}'::jsonb);
  end if;
  return coalesce(new,old);
end $$;
revoke execute on function public.signal_admin_assignment_change() from public,anon,authenticated;
create trigger admin_assignment_changed after insert or delete on public.event_roles
for each row execute function public.signal_admin_assignment_change();
