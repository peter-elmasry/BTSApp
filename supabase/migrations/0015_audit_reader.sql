-- Event history is private even when the leaderboard is public. Global member
-- audits (event_id IS NULL) belong to owner administration, not this reader.
create function public.get_audit_log(
  p_event uuid, p_limit integer default 50, p_before bigint default null,
  p_action text default null, p_entity text default null
) returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_items jsonb; v_count integer;
begin
  if not public.is_event_admin(p_event) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.events where id=p_event) then raise exception 'NOT_FOUND'; end if;
  if p_limit is null or p_limit not between 1 and 100
    or p_before <= 0 or length(p_action)>100 or length(p_entity)>100 then
    raise exception 'INVALID_AUDIT_QUERY';
  end if;
  -- IDs are monotonic and unique, including multiple writes at the same time.
  -- Serialize them as text to preserve bigint precision in JavaScript.
  with page as (
    select a.*, m.full_name_en, m.full_name_ar
    from public.audit_log a left join public.members m on m.id=a.actor_id
    where a.event_id=p_event and (p_before is null or a.id<p_before)
      and (p_action is null or a.action=p_action)
      and (p_entity is null or a.entity=p_entity)
    order by a.id desc limit p_limit+1
  )
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
    'id',id::text,'at',at,'action',action,'entity',entity,'entity_id',entity_id,
    'actor',case when full_name_en is null then null else jsonb_build_object(
      'name_en',full_name_en,'name_ar',full_name_ar) end,
    'before',before,'after',after) order by id desc),'[]'::jsonb)
  into v_count,v_items from page;
  if v_count>p_limit then v_items:=v_items-(v_count-1); end if;
  return jsonb_build_object('items',v_items,
    'next_before',case when v_count>p_limit then v_items->(p_limit-1)->>'id' end,
    'actions',coalesce((select jsonb_agg(x.action order by x.action) from
      (select distinct action from public.audit_log where event_id=p_event) x),'[]'::jsonb),
    'entities',coalesce((select jsonb_agg(x.entity order by x.entity) from
      (select distinct entity from public.audit_log where event_id=p_event) x),'[]'::jsonb));
end $$;

create index audit_log_event_id_cursor on public.audit_log(event_id,id desc);
revoke all on function public.get_audit_log(uuid,integer,bigint,text,text) from public,anon,authenticated;
grant execute on function public.get_audit_log(uuid,integer,bigint,text,text) to authenticated,service_role;
