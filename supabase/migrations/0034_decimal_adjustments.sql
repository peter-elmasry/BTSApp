-- D073: exact decimal bonuses/penalties, including quarter and half hearts.
-- 0033 is reserved for the independent shared-notification PR.
alter table public.adjustments alter column points type numeric using points::numeric;
alter table public.adjustments add constraint adjustments_decimal_precision
  check(points between -2147483648 and 2147483647 and points=round(points,2));
-- Replace the integer RPC rather than leaving ambiguous PostgREST overloads.
drop function public.add_adjustment(uuid,uuid,text,uuid,uuid,int,text);

create or replace function public.add_adjustment(p_op_id uuid,p_event uuid,p_scope text,p_match uuid,p_team uuid,p_points numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_rpc text; v_old jsonb; v_cap int; v_used numeric; v_id uuid; v_result jsonb; v_round uuid;
begin
  if not public.is_event_admin(p_event) and (p_scope is distinct from 'MATCH' or not public.is_referee_for_match(p_match)
      or not exists(select 1 from public.matches where id=p_match and event_id=p_event)) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name('add_adjustment',p_event,p_team,jsonb_build_object('scope',p_scope,'match',p_match,'points',p_points,'reason',p_reason));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) and (p_scope is distinct from 'MATCH' or not public.is_referee_for_match(p_match)
      or not exists(select 1 from public.matches where id=p_match and event_id=p_event)) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_scope is null or p_scope not in ('MATCH','EVENT') or (p_scope='MATCH')<>(p_match is not null)
      or p_points is null or p_points=0 or p_points::text in ('NaN','Infinity','-Infinity')
      or p_points not between -2147483648 and 2147483647 or p_points<>round(p_points,2) or p_reason is null or length(trim(p_reason)) not between 3 and 500
      or not exists(select 1 from public.teams where id=p_team and event_id=p_event)
      or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_ADJUSTMENT'); end if;
  if p_scope='MATCH' then
    select m.round_id into v_round from public.matches m where m.id=p_match and m.event_id=p_event
      and exists(select 1 from public.match_participants mp where mp.match_id=m.id and mp.team_id=p_team);
    if v_round is null then perform public.phase2_fail('INVALID_ADJUSTMENT'); end if;
    if not public.is_event_admin(p_event) and not exists(select 1 from public.rounds where id=v_round and status='ACTIVE') then perform public.phase2_fail('ROUND_NOT_ACTIVE'); end if;
    if exists(select 1 from public.matches where id=p_match and status='VOID') then perform public.phase2_fail('MATCH_VOID'); end if;
  end if;
  select case when p_scope='MATCH' then case when p_points>0 then match_bonus_cap else match_penalty_cap end
    else case when p_points>0 then event_bonus_cap else event_penalty_cap end end into v_cap from public.events where id=p_event;
  select coalesce(sum(abs(points)),0) into v_used from public.adjustments
    where event_id=p_event and team_id=p_team and scope=p_scope and match_id is not distinct from p_match
      and revoked_at is null and (points>0)=(p_points>0);
  if v_cap is not null and v_used+abs(p_points)>v_cap then perform public.phase2_fail('CAP_EXCEEDED',jsonb_build_object('remaining',greatest(v_cap-v_used,0))); end if;
  insert into public.adjustments(event_id,scope,match_id,team_id,points,reason,given_by)
    values(p_event,p_scope,p_match,p_team,p_points,trim(p_reason),public.current_member_id()) returning id into v_id;
  v_result:=jsonb_build_object('id',v_id,'event_id',p_event,'scope',p_scope,'match_id',p_match,'team_id',p_team,'points',p_points,'reason',trim(p_reason));
  perform public.audit(p_event,'ADJUSTMENT_ADDED','adjustment',v_id,null,v_result);
  perform public.emit(p_event,'adjustment_changed',jsonb_build_object('matchId',p_match,'roundId',v_round));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

revoke execute on function public.add_adjustment(uuid,uuid,text,uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.add_adjustment(uuid,uuid,text,uuid,uuid,numeric,text) to authenticated,service_role;

create or replace function public.phase6_standings(p_event uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  with scores as (
    select t.id,t.name_en,t.code,t.final_tiebreak_pos,e.scoring_mode,e.initial_lives,
      count(mp.outcome) filter(where mp.outcome<>'PENDING' and m.status='COMPLETED') as played,
      count(*) filter(where mp.outcome='WIN' and m.status='COMPLETED') as wins,
      count(*) filter(where mp.outcome='DRAW' and m.status='COMPLETED') as draws,
      count(*) filter(where mp.outcome='LOSS' and m.status='COMPLETED') as losses,
      count(*) filter(where mp.outcome='FORFEIT' and m.status='COMPLETED') as forfeits,
      coalesce(sum(case when m.status='COMPLETED' then case mp.outcome
        when 'WIN' then e.points_win when 'DRAW' then e.points_draw
        when 'LOSS' then e.points_loss when 'FORFEIT' then e.points_loss else 0 end else 0 end),0)::numeric as outcome_points,
      coalesce((select sum(a.points) from public.adjustments a
        left join public.matches am on am.id=a.match_id and am.event_id=p_event
        where a.event_id=p_event and a.team_id=t.id and a.revoked_at is null
          and (a.scope='EVENT' or am.status<>'VOID')),0)::numeric as adjustment_points
    from public.teams t join public.events e on e.id=t.event_id
      left join public.match_participants mp on mp.team_id=t.id
      left join public.matches m on m.id=mp.match_id and m.event_id=p_event
    where t.event_id=p_event group by t.id,e.points_win,e.points_draw,e.points_loss,e.scoring_mode,e.initial_lives
  ), lives as (
    select s.*,case when scoring_mode='LIVES' then initial_lives::bigint+outcome_points
      else outcome_points end as match_points from scores s
  ), totals as (
    select l.*,match_points+adjustment_points as total from lives l
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

create or replace function public.ux_team_breakdown(p_event uuid,p_team uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  with e as (select * from public.events where id=p_event),
  standing_row as (select x from jsonb_array_elements(public.phase6_standings(p_event)) x where x->'team'->>'id'=p_team::text),
  per_match as (
    select m.id,case when m.status<>'COMPLETED' then 0
      else case mp.outcome when 'WIN' then e.points_win when 'DRAW' then e.points_draw
        when 'LOSS' then e.points_loss when 'FORFEIT' then e.points_loss else 0 end end as value
    from public.match_participants mp join public.matches m on m.id=mp.match_id and m.event_id=p_event cross join e
    where mp.team_id=p_team
  )
  select jsonb_build_object(
    'scoring_mode',e.scoring_mode,'initial_lives',e.initial_lives,
    'match_points',(select (x->>'match_points')::numeric from standing_row),
    'adjustment_points',(select (x->>'adjustment_points')::numeric from standing_row),
    'total',(select (x->>'total')::numeric from standing_row),
    'lives_change',case when e.scoring_mode='LIVES' then (select (x->>'match_points')::numeric from standing_row)-e.initial_lives else null end,
    'match_values',coalesce((select jsonb_object_agg(id::text,value) from per_match),'{}'::jsonb))
  from e
$$;
