-- Phase 8 slice 3: public game details list the names of the game's referees.
-- Only active members who still hold the REFEREE role and an assignment to the
-- game are listed. Names only: no member ids, usernames or phone numbers (D036).
create or replace function public.phase8_game_referees_json(p_game uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar)
    order by mb.full_name_en,mb.id),'[]'::jsonb)
  from public.referee_games rg
    join public.games g on g.id=rg.game_id and g.event_id=rg.event_id
    join public.members mb on mb.id=rg.member_id and mb.is_active
  where rg.game_id=p_game and exists(select 1 from public.event_roles er
    where er.event_id=rg.event_id and er.member_id=rg.member_id and er.role='REFEREE')
$$;

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
      'ends_at',r.started_at+make_interval(mins=>r.duration_min+r.extension_min),
      'is_overtime',r.status='ACTIVE' and r.started_at is not null
        and now()>r.started_at+make_interval(mins=>r.duration_min+r.extension_min)
    ) order by r.number) from public.rounds r where r.event_id=p_event),'[]'::jsonb)
  );
end $$;

revoke execute on function public.phase8_game_referees_json(uuid) from public,anon,authenticated;
revoke execute on function public.get_bootstrap(uuid) from public;
grant execute on function public.get_bootstrap(uuid) to anon,authenticated;
