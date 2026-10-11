-- A team may have several guides (DECISIONS D031). One member still guides at most one team per event.
drop index if exists public.one_guide_per_team;

-- `guide` stays the first guide (by name) for existing clients; `guides` lists all of them.
create or replace function public.phase4_team_json(p_team uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  with g as (
    select jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar)
      || case when e.show_guide_phone then jsonb_build_object('phone',mb.phone) else '{}'::jsonb end as guide,
      mb.full_name_en, mb.username
    from public.teams t
    join public.events e on e.id=t.event_id
    join public.event_roles er on er.event_id=t.event_id and er.team_id=t.id and er.role='GUIDE'
    join public.members mb on mb.id=er.member_id and mb.is_active
    where t.id=p_team
  )
  select jsonb_build_object(
    'id',t.id,'code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,
    'avatar_key',t.avatar_key,'color_hex',t.color_hex,'sort_order',t.sort_order,
    'guide',(select guide from g order by full_name_en,username limit 1),
    'guides',coalesce((select jsonb_agg(guide order by full_name_en,username) from g),'[]'::jsonb)
  ) from public.teams t where t.id=p_team
$$;

-- Standings never carry guide contact details.
create or replace function public.phase6_standings(p_event uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  with scores as (
    select t.id,t.name_en,t.code,t.final_tiebreak_pos,
      count(mp.outcome) filter(where mp.outcome<>'PENDING' and m.status='COMPLETED') as played,
      count(*) filter(where mp.outcome='WIN' and m.status='COMPLETED') as wins,
      count(*) filter(where mp.outcome='DRAW' and m.status='COMPLETED') as draws,
      count(*) filter(where mp.outcome='LOSS' and m.status='COMPLETED') as losses,
      count(*) filter(where mp.outcome='FORFEIT' and m.status='COMPLETED') as forfeits,
      coalesce(sum(case when m.status='COMPLETED' then case mp.outcome
        when 'WIN' then e.points_win when 'DRAW' then e.points_draw
        when 'LOSS' then e.points_loss when 'FORFEIT' then e.points_loss else 0 end else 0 end),0)::bigint as match_points,
      coalesce((select sum(a.points::bigint) from public.adjustments a
        left join public.matches am on am.id=a.match_id and am.event_id=p_event
        where a.event_id=p_event and a.team_id=t.id and a.revoked_at is null
          and (a.scope='EVENT' or am.status<>'VOID')),0)::bigint as adjustment_points
    from public.teams t join public.events e on e.id=t.event_id
      left join public.match_participants mp on mp.team_id=t.id
      left join public.matches m on m.id=mp.match_id and m.event_id=p_event
    where t.event_id=p_event group by t.id,e.points_win,e.points_draw,e.points_loss
  ), totals as (
    select s.*,match_points+adjustment_points as total from scores s
  ), cohorts as (
    select s.*,count(*) over(partition by total) as cohort_size,
      count(final_tiebreak_pos) over(partition by total) as resolved_count,
      min(final_tiebreak_pos) over(partition by total) as first_position,
      max(final_tiebreak_pos) over(partition by total) as last_position,
      (select count(distinct x.final_tiebreak_pos) from totals x where x.total=s.total) as distinct_positions
    from totals s
  ), resolved as (
    select c.*,cohort_size>1 and resolved_count=cohort_size and distinct_positions=cohort_size
      and first_position=1 and last_position=cohort_size as has_resolution from cohorts c
  ), ranked as (
    select r.*,rank() over(order by total desc) as shared_rank,
      row_number() over(partition by total order by final_tiebreak_pos nulls last,name_en,code,id) as cohort_position
    from resolved r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',shared_rank+case when has_resolution then cohort_position-1 else 0 end,
    'team',(public.phase4_team_json(id)#-'{guide,phone}')-'guides',
    'played',played,'wins',wins,'draws',draws,'losses',losses,'forfeits',forfeits,
    'match_points',match_points,'adjustment_points',adjustment_points,'total',total,
    'is_tied',cohort_size>1 and not has_resolution,
    'final_tiebreak_pos',case when has_resolution then final_tiebreak_pos else null end)
    order by total desc,case when has_resolution then final_tiebreak_pos else null end nulls last,name_en,code,id),'[]'::jsonb)
  from ranked
$$;
