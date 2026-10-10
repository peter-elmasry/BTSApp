-- Phase 4: explicit public read contracts. Domain tables remain private.
create or replace function public.phase4_event_json(p_event uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'id',e.id,'code',e.code,'name_en',e.name_en,'name_ar',e.name_ar,'status',e.status,
    'starts_on',e.starts_on,'leaderboard_public',e.leaderboard_public,'show_guide_phone',e.show_guide_phone,
    'points_win',e.points_win,'points_draw',e.points_draw,'points_loss',e.points_loss,
    'currency_en_one',e.currency_en_one,'currency_en_other',e.currency_en_other,
    'currency_ar_one',e.currency_ar_one,'currency_ar_two',e.currency_ar_two,'currency_ar_plural',e.currency_ar_plural
  ) from public.events e where e.id=p_event
$$;

create or replace function public.phase4_team_json(p_team uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'id',t.id,'code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,
    'avatar_key',t.avatar_key,'color_hex',t.color_hex,'sort_order',t.sort_order,
    'guide',(select jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar)
      || case when e.show_guide_phone then jsonb_build_object('phone',mb.phone) else '{}'::jsonb end
      from public.event_roles er join public.members mb on mb.id=er.member_id and mb.is_active
      where er.event_id=t.event_id and er.team_id=t.id and er.role='GUIDE')
  ) from public.teams t join public.events e on e.id=t.event_id where t.id=p_team
$$;

create or replace function public.phase4_matches_json(p_event uuid,p_team uuid default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'round_id',m.round_id,'game_id',m.game_id,'status',m.status,
    'participants',(select coalesce(jsonb_agg(
      jsonb_build_object('team_id',mp.team_id,'team_code',t.code,'side',mp.side)
      || case when public.can_see_results(p_event) or mp.team_id=p_team
        then jsonb_build_object('outcome',mp.outcome) else '{}'::jsonb end
      order by mp.side nulls first,t.sort_order,t.code),'[]'::jsonb)
      from public.match_participants mp join public.teams t on t.id=mp.team_id and t.event_id=p_event
      where mp.match_id=m.id)
  ) order by r.number,g.code),'[]'::jsonb)
  from public.matches m join public.rounds r on r.id=m.round_id and r.event_id=p_event
    join public.games g on g.id=m.game_id and g.event_id=p_event
  where m.event_id=p_event and (p_team is null or exists(
    select 1 from public.match_participants own where own.match_id=m.id and own.team_id=p_team))
$$;

create or replace function public.get_current_event()
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select public.phase4_event_json(e.id) from public.events e where e.is_current
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
      'location_en',g.location_en,'location_ar',g.location_ar,'image_path',g.image_path
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

create or replace function public.get_schedule(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$
begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  return public.phase4_matches_json(p_event);
end $$;

create or replace function public.get_team_view(p_event uuid,p_team_code text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_team uuid;
begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  select id into v_team from public.teams where event_id=p_event and code=upper(trim(p_team_code));
  if v_team is null then perform public.phase2_fail('NOT_FOUND'); end if;
  return jsonb_build_object(
    'team',public.phase4_team_json(v_team),
    'matches',public.phase4_matches_json(p_event,v_team),
    'adjustments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'scope',a.scope,'match_id',a.match_id,'points',a.points,'reason',a.reason,
      'given_by',jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar),
      'created_at',a.created_at
    ) order by a.created_at,a.id) from public.adjustments a join public.members mb on mb.id=a.given_by
      where a.event_id=p_event and a.team_id=v_team and a.revoked_at is null),'[]'::jsonb)
  );
end $$;

revoke execute on function public.phase4_event_json(uuid),public.phase4_team_json(uuid),public.phase4_matches_json(uuid,uuid),
  public.get_current_event(),public.get_bootstrap(uuid),public.get_schedule(uuid),public.get_team_view(uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_current_event(),public.get_bootstrap(uuid),public.get_schedule(uuid),public.get_team_view(uuid,text)
  to anon,authenticated,service_role;
