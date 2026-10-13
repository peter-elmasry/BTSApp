-- Referee history (D050): "My station" keeps the referee's finished matches of ended
-- rounds as read-only history (bucket 'done'), next to current, upcoming and late ones.
-- Only matches of the referee's own games are listed; editing rules are unchanged.
create or replace function public.get_referee_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_matches uuid[]; v_admin boolean; v_result jsonb; begin
  if not public.is_staff(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  v_admin:=public.is_event_admin(p_event);
  select coalesce(array_agg(m.id),array[]::uuid[]) into v_matches from public.matches m
    where m.event_id=p_event and (v_admin or public.is_referee_for_match(m.id));
  v_result:=public.phase5_snapshot(p_event,v_matches);
  v_result:=jsonb_set(v_result,'{matches}',coalesce((select jsonb_agg(x||jsonb_build_object(
      'bucket',case r.status when 'ACTIVE' then 'current' when 'DRAFT' then 'upcoming'
        else case when m.status='SCHEDULED' then 'late' else 'done' end end,
      'editable',v_admin or r.status='ACTIVE' or (r.status='CLOSED' and m.status='SCHEDULED')) order by e.ord)
    from jsonb_array_elements(v_result->'matches') with ordinality e(x,ord)
      join public.matches m on m.id=(e.x->>'id')::uuid join public.rounds r on r.id=m.round_id),'[]'::jsonb));
  return v_result||jsonb_build_object('team_guides',public.ux_team_guides_json(p_event,
    (select coalesce(array_agg(distinct mp.team_id),array[]::uuid[]) from public.match_participants mp
      join public.matches m on m.id=mp.match_id join public.rounds r on r.id=m.round_id
      where mp.match_id=any(v_matches) and (r.status<>'CLOSED' or m.status='SCHEDULED'))));
end $$;
