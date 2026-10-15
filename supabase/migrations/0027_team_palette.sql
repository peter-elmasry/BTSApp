-- D060: named reusable swatches; team HEX values are independent snapshots.
alter table public.events add column team_palette jsonb not null default '[]'::jsonb;
create or replace function public.valid_team_palette(p_palette jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp
as $$
declare v_entry jsonb; v_names text[]:='{}'; v_hexes text[]:='{}'; v_name text; v_hex text;
begin
  if p_palette is null or jsonb_typeof(p_palette)<>'array' then return false; end if;
  if jsonb_array_length(p_palette)>32 then return false; end if;
  for v_entry in select value from jsonb_array_elements(p_palette) loop
    if jsonb_typeof(v_entry)<>'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v_entry))<>2 or not (v_entry ?& array['name','hex'])
      or jsonb_typeof(v_entry->'name')<>'string' or jsonb_typeof(v_entry->'hex')<>'string' then return false; end if;
    v_name:=v_entry->>'name'; v_hex:=v_entry->>'hex';
    if v_name<>btrim(v_name) or char_length(v_name) not between 1 and 40 or v_hex !~ '^#[0-9A-F]{6}$'
      or lower(v_name)=any(v_names) or v_hex=any(v_hexes) then return false; end if;
    v_names:=array_append(v_names,lower(v_name)); v_hexes:=array_append(v_hexes,v_hex);
  end loop;
  return true;
end $$;
alter table public.events add constraint events_team_palette_valid check(public.valid_team_palette(team_palette));
revoke execute on function public.valid_team_palette(jsonb) from public,anon,authenticated;

create or replace function public.set_team_palette(p_op_id uuid,p_event uuid,p_palette jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_old jsonb; v_before jsonb; v_normalized jsonb;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_old:=public.op_result(p_op_id,'set_team_palette:'||p_event::text); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  if p_palette is null or jsonb_typeof(p_palette)<>'array' then perform public.phase2_fail('INVALID_PALETTE'); end if;
  if jsonb_array_length(p_palette)>32 then perform public.phase2_fail('INVALID_PALETTE'); end if;
  if exists(select 1 from jsonb_array_elements(p_palette) e where jsonb_typeof(e)<>'object') then perform public.phase2_fail('INVALID_PALETTE'); end if;
  if exists(select 1 from jsonb_array_elements(p_palette) e where (select count(*) from jsonb_object_keys(e))<>2 or not (e ?& array['name','hex']) or jsonb_typeof(e->'name')<>'string' or jsonb_typeof(e->'hex')<>'string') then perform public.phase2_fail('INVALID_PALETTE'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',btrim(e->>'name'),'hex',upper(btrim(e->>'hex'))) order by ordinal),'[]'::jsonb)
    into v_normalized from jsonb_array_elements(p_palette) with ordinality x(e,ordinal);
  if not public.valid_team_palette(v_normalized) then perform public.phase2_fail('INVALID_PALETTE'); end if;
  select team_palette into v_before from public.events where id=p_event;
  update public.events set team_palette=v_normalized where id=p_event;
  perform public.audit(p_event,'TEAM_PALETTE_UPDATED','event',p_event,v_before,v_normalized);
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'set_team_palette:'||p_event::text,v_normalized);
end $$;
revoke execute on function public.set_team_palette(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_team_palette(uuid,uuid,jsonb) to authenticated,service_role;
