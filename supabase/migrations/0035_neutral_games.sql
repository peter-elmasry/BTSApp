-- D074: neutral games are a reversible scoring projection; stored results never change.
alter table public.games add column is_neutral boolean not null default false;

-- Private read projections. No direct table/view access is granted to clients.
create view public.neutral_matches as
select m.id,m.event_id,m.round_id,m.game_id,
  case when g.is_neutral and m.status<>'VOID' then 'COMPLETED' else m.status end as status,
  case when g.is_neutral and m.status<>'VOID' then null else m.result_entered_by end as result_entered_by,
  case when g.is_neutral and m.status<>'VOID' then null else m.result_entered_at end as result_entered_at,
  m.void_reason,(g.is_neutral and m.status<>'VOID') as is_neutral,
  case when g.is_neutral then null else m.audio_result_at end as audio_result_at,
  case when g.is_neutral then null else m.audio_config_at_result end as audio_config_at_result
from public.matches m join public.games g on g.id=m.game_id and g.event_id=m.event_id;
create view public.neutral_participants as
select mp.match_id,mp.round_id,mp.team_id,mp.side,
  case when g.is_neutral and m.status<>'VOID' then 'WIN' else mp.outcome end as outcome
from public.match_participants mp join public.matches m on m.id=mp.match_id
  join public.games g on g.id=m.game_id and g.event_id=m.event_id;
revoke all on public.neutral_matches,public.neutral_participants from public,anon,authenticated;

create function public.set_game_neutral(p_op_id uuid,p_game uuid,p_neutral boolean,p_expected_neutral boolean,p_expected_matches int)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_event uuid; v_rpc text; v_old jsonb; v_before boolean; v_count int; v_result jsonb;
begin
  select event_id into v_event from public.games where id=p_game;
  if v_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_neutral is null or p_expected_neutral is null or p_expected_matches is null or p_expected_matches<0 then
    perform public.phase2_fail('INVALID_GAME'); end if;
  v_rpc:=public.phase5_operation_name('set_game_neutral',v_event,p_game,jsonb_build_object('neutral',p_neutral,'expected',p_expected_neutral,'matches',p_expected_matches));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(v_event);
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  select is_neutral into v_before from public.games where id=p_game and event_id=v_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  select count(*) into v_count from public.matches where game_id=p_game and event_id=v_event and status<>'VOID';
  if v_before is distinct from p_expected_neutral or v_count<>p_expected_matches then
    perform public.phase2_fail('NEUTRAL_GAME_CHANGED'); end if;
  update public.games set is_neutral=p_neutral where id=p_game;
  if v_before is distinct from p_neutral then
    update public.teams set final_tiebreak_pos=null where event_id=v_event and final_tiebreak_pos is not null;
  end if;
  v_result:=jsonb_build_object('id',p_game,'event_id',v_event,'is_neutral',p_neutral,'affected_matches',v_count);
  perform public.audit(v_event,'GAME_NEUTRAL_CHANGED','game',p_game,jsonb_build_object('is_neutral',v_before),v_result);
  perform public.emit(v_event,'roster_changed',jsonb_build_object('gameId',p_game));
  perform public.emit(v_event,'match_changed',jsonb_build_object('gameId',p_game));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;
revoke execute on function public.set_game_neutral(uuid,uuid,boolean,boolean,int) from public,anon,authenticated;
grant execute on function public.set_game_neutral(uuid,uuid,boolean,boolean,int) to authenticated,service_role;

-- Preserve existing visibility and ACLs for phase4_matches_json.
create or replace function public.phase4_matches_json(p_event uuid,p_team uuid default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'round_id',m.round_id,'game_id',m.game_id,'status',m.status,'is_neutral',m.is_neutral,
    'participants',(select coalesce(jsonb_agg(
      jsonb_build_object('team_id',mp.team_id,'team_code',t.code,'side',mp.side)
      || case when public.can_see_results(p_event) or mp.team_id=p_team
        then jsonb_build_object('outcome',mp.outcome) else '{}'::jsonb end
      order by mp.side nulls first,t.sort_order,t.code),'[]'::jsonb)
      from public.neutral_participants mp join public.teams t on t.id=mp.team_id and t.event_id=p_event
      where mp.match_id=m.id)
  ) order by r.number,g.code),'[]'::jsonb)
  from public.neutral_matches m join public.rounds r on r.id=m.round_id and r.event_id=p_event
    join public.games g on g.id=m.game_id and g.event_id=p_event
  where m.event_id=p_event and (p_team is null or exists(
    select 1 from public.neutral_participants own where own.match_id=m.id and own.team_id=p_team))
$$;

-- Preserve existing visibility and ACLs for phase5_match_json.
create or replace function public.phase5_match_json(p_match uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select jsonb_build_object('id',m.id,'round_id',m.round_id,'game_id',m.game_id,'status',m.status,'is_neutral',m.is_neutral,
    'result_entered_by',m.result_entered_by,'result_entered_at',m.result_entered_at,
    'participants',coalesce((select jsonb_agg(jsonb_build_object('team_id',mp.team_id,'team_code',t.code,
      'side',mp.side,'outcome',mp.outcome) order by mp.side nulls first,t.sort_order,t.code)
      from public.neutral_participants mp join public.teams t on t.id=mp.team_id and t.event_id=m.event_id
      where mp.match_id=m.id),'[]'::jsonb)) from public.neutral_matches m where m.id=p_match
$$;

-- Preserve existing visibility and ACLs for phase6_standings.
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
        left join public.neutral_matches am on am.id=a.match_id and am.event_id=p_event
        where a.event_id=p_event and a.team_id=t.id and a.revoked_at is null
          and (a.scope='EVENT' or am.status<>'VOID')),0)::numeric as adjustment_points
    from public.teams t join public.events e on e.id=t.event_id
      left join public.neutral_participants mp on mp.team_id=t.id
      left join public.neutral_matches m on m.id=mp.match_id and m.event_id=p_event
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

-- Preserve existing visibility and ACLs for ux_team_breakdown.
create or replace function public.ux_team_breakdown(p_event uuid,p_team uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  with e as (select * from public.events where id=p_event),
  standing_row as (select x from jsonb_array_elements(public.phase6_standings(p_event)) x where x->'team'->>'id'=p_team::text),
  per_match as (
    select m.id,case when m.status<>'COMPLETED' then 0
      else case mp.outcome when 'WIN' then e.points_win when 'DRAW' then e.points_draw
        when 'LOSS' then e.points_loss when 'FORFEIT' then e.points_loss else 0 end end as value
    from public.neutral_participants mp join public.neutral_matches m on m.id=mp.match_id and m.event_id=p_event cross join e
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

-- Preserve existing visibility and ACLs for get_export_data.
create or replace function public.get_export_data(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_result jsonb; begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  -- STABLE uses one statement snapshot for all nested builders and aggregates.
  select jsonb_build_object('event',public.phase4_event_json(p_event),'generated_at',statement_timestamp(),
    'standings',public.phase6_standings(p_event),
    'matches',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'round_number',r.number,'round_type',r.type,'game_code',g.code,'game_name_en',g.name_en,'game_name_ar',g.name_ar,'status',m.status,'is_neutral',m.is_neutral,
      'participants',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,'outcome',mp.outcome)
        order by mp.side nulls first,t.sort_order,t.code) from public.neutral_participants mp join public.teams t on t.id=mp.team_id where mp.match_id=m.id),'[]'::jsonb),
      'entered_by',(select jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar) from public.members mb where mb.id=m.result_entered_by),
      'result_entered_at',m.result_entered_at) order by r.number,g.code,m.id)
      from public.neutral_matches m join public.rounds r on r.id=m.round_id join public.games g on g.id=m.game_id where m.event_id=p_event),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'team_code',t.code,'team_name_en',t.name_en,'team_name_ar',t.name_ar,
      'scope',a.scope,'match_id',a.match_id,'points',a.points,'reason',a.reason,
      'given_by',jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar),'created_at',a.created_at,'revoked_at',a.revoked_at,'revoke_reason',a.revoke_reason)
      order by a.created_at,a.id) from public.adjustments a join public.teams t on t.id=a.team_id join public.members mb on mb.id=a.given_by where a.event_id=p_event),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('member_id',mb.id,'username',mb.username,'name_en',mb.full_name_en,'name_ar',mb.full_name_ar,
      'role',er.role,'team_code',t.code,'game_codes',coalesce((select jsonb_agg(g.code order by g.code) from public.referee_games rg join public.games g on g.id=rg.game_id
        where rg.event_id=p_event and rg.member_id=mb.id and er.role='REFEREE'),'[]'::jsonb)) order by er.role,mb.full_name_en,mb.id)
      from public.event_roles er join public.members mb on mb.id=er.member_id left join public.teams t on t.id=er.team_id where er.event_id=p_event),'[]'::jsonb)) into v_result;
  return v_result;
end $$;

-- Preserve existing visibility and ACLs for get_schedule.
create or replace function public.get_schedule(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_result jsonb; begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  v_result:=public.phase4_matches_json(p_event);
  if public.can_see_results(p_event) then
    select coalesce(jsonb_agg(x.value||jsonb_build_object('result_entered_at',m.result_entered_at) order by x.ordinality),'[]'::jsonb)
      into v_result from jsonb_array_elements(v_result) with ordinality x(value,ordinality)
      join public.neutral_matches m on m.id=(x.value->>'id')::uuid;
  end if;
  return v_result;
end $$;

-- Preserve existing visibility and ACLs for get_bootstrap.
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
      'location_en',g.location_en,'location_ar',g.location_ar,'image_path',g.image_path,'is_neutral',g.is_neutral,
      'referees',public.phase8_game_referees_json(g.id)
    ) order by g.code) from public.games g where g.event_id=p_event),'[]'::jsonb),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'number',r.number,'type',r.type,'name_en',r.name_en,'name_ar',r.name_ar,
      'duration_min',r.duration_min,'extension_min',r.extension_min,'status',r.status,
      'started_at',r.started_at,'closed_at',r.closed_at,
      'attachment',case when r.type='OPENING' and r.attachment_visible and r.attachment_path is not null
        then jsonb_build_object('path',r.attachment_path,'mime',r.attachment_mime,'title',r.attachment_title) else null end,
      'ends_at',r.started_at+make_interval(mins=>r.duration_min+r.extension_min),
      'is_overtime',r.status='ACTIVE' and r.started_at is not null
        and now()>r.started_at+make_interval(mins=>r.duration_min+r.extension_min),
      -- D041: matches still without a result after the round ended (no outcomes revealed).
      'late_count',case when r.status='CLOSED' then (select count(*) from public.neutral_matches m
        where m.round_id=r.id and m.status='SCHEDULED') else 0 end
    ) order by r.number) from public.rounds r where r.event_id=p_event),'[]'::jsonb)
  );
end $$;

-- Preserve existing visibility and ACLs for get_referee_board.
create or replace function public.get_referee_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_matches uuid[]; v_admin boolean; v_result jsonb; begin
  if not public.is_staff(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  v_admin:=public.is_event_admin(p_event);
  select coalesce(array_agg(m.id),array[]::uuid[]) into v_matches from public.neutral_matches m
    where m.event_id=p_event and (v_admin or public.is_referee_for_match(m.id));
  v_result:=public.phase5_snapshot(p_event,v_matches);
  v_result:=jsonb_set(v_result,'{matches}',coalesce((select jsonb_agg(x||jsonb_build_object(
      'bucket',case when m.is_neutral and m.status<>'VOID' then 'done' else case r.status when 'ACTIVE' then 'current' when 'DRAFT' then 'upcoming'
        else case when m.status='SCHEDULED' then 'late' else 'done' end end end,
      'editable',not m.is_neutral and (v_admin or r.status='ACTIVE' or (r.status='CLOSED' and m.status='SCHEDULED'))) order by e.ord)
    from jsonb_array_elements(v_result->'matches') with ordinality e(x,ord)
      join public.neutral_matches m on m.id=(e.x->>'id')::uuid join public.rounds r on r.id=m.round_id),'[]'::jsonb));
  return v_result||jsonb_build_object('team_guides',public.ux_team_guides_json(p_event,
    (select coalesce(array_agg(distinct mp.team_id),array[]::uuid[]) from public.neutral_participants mp
      join public.neutral_matches m on m.id=mp.match_id join public.rounds r on r.id=m.round_id
      where mp.match_id=any(v_matches) and (r.status<>'CLOSED' or m.status='SCHEDULED'))));
end $$;

-- Preserve existing visibility and ACLs for get_pending_matches.
create or replace function public.get_pending_matches(p_round uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_event uuid; v_result jsonb; begin
  select event_id into v_event from public.rounds where id=p_round;
  if v_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  select coalesce(jsonb_agg(public.phase5_match_json(m.id) order by g.code),'[]'::jsonb) into v_result
    from public.neutral_matches m join public.games g on g.id=m.game_id where m.round_id=p_round and m.status='SCHEDULED';
  return v_result;
end $$;

-- Preserve existing visibility and ACLs for get_team_audio_results.
create or replace function public.get_team_audio_results(p_event uuid,p_team_code text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_team uuid; v_config jsonb; v_matches jsonb; begin
  select audio_config into v_config from public.events where id=p_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  select id into v_team from public.teams where event_id=p_event and code=upper(btrim(p_team_code));
  if v_team is null then perform public.phase2_fail('NOT_FOUND'); end if;
  -- Use the same visibility-aware builder as get_team_view, retaining only the requested team's outcome.
  v_matches:=public.phase4_matches_json(p_event,v_team);
  return jsonb_build_object('serverNow',clock_timestamp(),'config',v_config,'results',coalesce((
    select jsonb_agg(jsonb_build_object('matchId',m.id,'roundId',m.round_id,
      'outcome',case when m.status='COMPLETED' then participant->>'outcome' else 'PENDING' end,
      'occurredAt',coalesce(m.audio_result_at,m.result_entered_at),
      'audible',coalesce(m.status='COMPLETED' and (m.audio_config_at_result->>'enabled')::boolean
        and (m.audio_config_at_result->>case participant->>'outcome' when 'WIN' then 'match_win' when 'DRAW' then 'match_draw' else 'match_loss' end)::boolean,false)) order by m.id)
    from jsonb_array_elements(v_matches) x
      join public.neutral_matches m on m.id=(x->>'id')::uuid and m.event_id=p_event
      cross join lateral jsonb_array_elements(x->'participants') participant
    where participant->>'team_id'=v_team::text
  ),'[]'::jsonb));
end $$;

create or replace function public.phase5_match_mutation(p_op_id uuid,p_match uuid,p_action text,p_outcomes jsonb default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_event uuid; v_round public.rounds; v_status text; v_rpc text; v_old jsonb; v_before jsonb; v_result jsonb;
  v_count int; v_outcomes text[]; v_correcting boolean;
begin
  select event_id into v_event from public.matches where id=p_match;
  if v_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) and (p_action<>'submit_match_result' or not public.is_referee_for_match(p_match)) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name(p_action,v_event,p_match,jsonb_build_object('outcomes',p_outcomes,'reason',p_reason));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(v_event);
  -- Assignment changes use the same event lock; recheck after waiting for it.
  if not public.is_event_admin(v_event) and (p_action<>'submit_match_result' or not public.is_referee_for_match(p_match)) then perform public.phase2_fail('FORBIDDEN'); end if;
  -- Check after the event lock, before accepting any new or queued result/reset.
  if p_action in ('submit_match_result','reset_match_result') and exists(
      select 1 from public.matches m join public.games g on g.id=m.game_id
      where m.id=p_match and g.is_neutral) then perform public.phase2_fail('NEUTRAL_GAME'); end if;
  select r.* into v_round from public.rounds r join public.matches m on m.round_id=r.id where m.id=p_match;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  v_before:=public.phase5_match_json(p_match); v_status:=v_before->>'status'; v_correcting:=v_status='COMPLETED';
  -- D041: after a round ends, the assigned referee may still enter the first result of a
  -- late (still SCHEDULED) match. Corrections in an ended round stay administrator-only.
  if not public.is_event_admin(v_event) and not (v_round.status='ACTIVE'
      or (v_round.status='CLOSED' and p_action='submit_match_result' and v_status='SCHEDULED')) then
    perform public.phase2_fail('ROUND_NOT_ACTIVE');
  end if;
  if p_action='submit_match_result' then
    if v_status='VOID' then perform public.phase2_fail('MATCH_VOID'); end if;
    if p_outcomes is null or jsonb_typeof(p_outcomes)<>'array' then perform public.phase2_fail('INVALID_OUTCOMES'); end if;
    select count(*) into v_count from public.match_participants where match_id=p_match;
    if v_count<2 or jsonb_array_length(p_outcomes)<>v_count then perform public.phase2_fail('INVALID_OUTCOMES'); end if;
    if v_round.type='OPENING' and (v_count<>(select count(*) from public.teams where event_id=v_event)
        or exists(select 1 from public.teams t where t.event_id=v_event and not exists(select 1 from public.match_participants mp where mp.match_id=p_match and mp.team_id=t.id))) then
      perform public.phase2_fail('INVALID_OUTCOMES');
    end if;
    if exists(select 1 from jsonb_array_elements(p_outcomes) x where jsonb_typeof(x)<>'object') then perform public.phase2_fail('INVALID_OUTCOMES'); end if;
    if exists(select 1 from jsonb_array_elements(p_outcomes) x where
        jsonb_typeof(x->'team_id') is distinct from 'string' or jsonb_typeof(x->'outcome') is distinct from 'string'
        or coalesce(x->>'outcome','') not in ('WIN','LOSS','DRAW','FORFEIT')
        or exists(select 1 from jsonb_object_keys(x) k where k not in ('team_id','outcome'))
        or not exists(select 1 from public.match_participants mp where mp.match_id=p_match and mp.team_id::text=x->>'team_id'))
      or (select count(distinct x->>'team_id') from jsonb_array_elements(p_outcomes) x)<>v_count then perform public.phase2_fail('INVALID_OUTCOMES'); end if;
    select array_agg(x->>'outcome' order by x->>'outcome') into v_outcomes from jsonb_array_elements(p_outcomes) x;
    if (v_round.type='REGULAR' and (v_count<>2 or v_outcomes not in (
        array['LOSS','WIN'],array['DRAW','DRAW'],array['FORFEIT','WIN'],array['FORFEIT','FORFEIT'])))
      or (v_round.type='OPENING' and ('DRAW'=any(v_outcomes) or (not 'WIN'=any(v_outcomes) and exists(select 1 from unnest(v_outcomes) x where x<>'FORFEIT')))) then
      perform public.phase2_fail('INVALID_OUTCOMES');
    end if;
    update public.match_participants mp set outcome=x.value->>'outcome' from jsonb_array_elements(p_outcomes) x where mp.match_id=p_match and mp.team_id::text=x.value->>'team_id';
    update public.matches set status='COMPLETED',result_entered_by=public.current_member_id(),result_entered_at=now(),void_reason=null where id=p_match;
  elsif p_action='reset_match_result' then
    update public.match_participants set outcome='PENDING' where match_id=p_match;
    update public.matches set status='SCHEDULED',result_entered_by=null,result_entered_at=null,void_reason=null where id=p_match;
  elsif p_action='void_match' then
    if p_reason is null or length(trim(p_reason)) not between 3 and 500 then perform public.phase2_fail('INVALID_REASON'); end if;
    update public.matches set status='VOID',void_reason=trim(p_reason) where id=p_match;
  else perform public.phase2_fail('INVALID_MATCH'); end if;
  v_result:=public.phase5_match_json(p_match);
  perform public.audit(v_event,case p_action when 'submit_match_result' then case when v_correcting then 'MATCH_RESULT_CORRECTED' else 'MATCH_RESULT_SUBMITTED' end when 'reset_match_result' then 'MATCH_RESULT_RESET' else 'MATCH_VOIDED' end,
    'match',p_match,v_before,v_result||jsonb_build_object('reason',p_reason));
  perform public.emit(v_event,'match_changed',jsonb_build_object('matchId',p_match,'roundId',v_round.id));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

-- Neutral matches do not become late results when their round closes.
create or replace function public.phase5_round_mutation(p_op_id uuid,p_round uuid,p_action text,p_minutes int default null,
  p_reason text default null,p_started_minutes_ago int default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_event uuid; v_round public.rounds; v_rpc text; v_old jsonb; v_before jsonb; v_result jsonb;
  v_late jsonb:='[]'::jsonb; v_start timestamptz; v_offset int:=coalesce(p_started_minutes_ago,0);
begin
  select event_id into v_event from public.rounds where id=p_round;
  if v_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  -- The offset joins the operation payload only when used, so operations queued by
  -- older clients replay under their original name.
  v_rpc:=public.phase5_operation_name(p_action,v_event,p_round,jsonb_build_object('minutes',p_minutes,'reason',p_reason)
    ||case when v_offset<>0 then jsonb_build_object('started_minutes_ago',v_offset) else '{}'::jsonb end);
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(v_event);
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  select * into v_round from public.rounds where id=p_round;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  v_before:=to_jsonb(v_round);
  if p_action='start_round' then
    if v_round.status<>'DRAFT' then perform public.phase2_fail('ROUND_NOT_DRAFT'); end if;
    if exists(select 1 from public.rounds where event_id=v_event and status='ACTIVE') then perform public.phase2_fail('ACTIVE_ROUND_EXISTS'); end if;
    if v_offset not between 0 and 180 then perform public.phase2_fail('INVALID_START_OFFSET'); end if;
    v_start:=now()-make_interval(mins=>v_offset);
    if exists(select 1 from public.rounds where event_id=v_event and id<>p_round and closed_at>v_start) then
      perform public.phase2_fail('START_BEFORE_PREVIOUS_ROUND_END');
    end if;
    if exists(select 1 from public.matches m where m.round_id=p_round and m.status<>'VOID' and (
        (v_round.type='REGULAR' and ((select count(*) from public.match_participants mp where mp.match_id=m.id)<>2
          or (select count(distinct side) from public.match_participants mp where mp.match_id=m.id)<>2))
        or (v_round.type='OPENING' and ((select count(*) from public.teams where event_id=v_event)<2
          or exists(select 1 from public.teams t where t.event_id=v_event and not exists(select 1 from public.match_participants mp where mp.match_id=m.id and mp.team_id=t.id))
          or (select count(*) from public.match_participants mp where mp.match_id=m.id)<>(select count(*) from public.teams where event_id=v_event)))
      )) or (v_round.type='OPENING' and (select count(*) from public.matches where round_id=p_round)<>1) then
      perform public.phase2_fail('INVALID_ROUND_MATCHES');
    end if;
    update public.rounds set status='ACTIVE',started_at=v_start,closed_at=null where id=p_round;
    update public.events set status='LIVE',updated_at=now() where id=v_event and status='DRAFT';
  elsif p_action='extend_round' then
    if v_round.status<>'ACTIVE' then perform public.phase2_fail('ROUND_NOT_ACTIVE'); end if;
    if p_minutes is null or p_minutes not between 1 and 120 then perform public.phase2_fail('INVALID_MINUTES'); end if;
    update public.rounds set extension_min=extension_min+p_minutes where id=p_round;
  elsif p_action='close_round' then
    if v_round.status<>'ACTIVE' then perform public.phase2_fail('ROUND_NOT_ACTIVE'); end if;
    -- Matches without a result stay SCHEDULED as late results; nothing is voided or forfeited.
    select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into v_late from public.neutral_matches where round_id=p_round and status='SCHEDULED';
    update public.rounds set status='CLOSED',closed_at=now() where id=p_round;
  elsif p_action='reopen_round' then
    if v_round.status<>'CLOSED' then perform public.phase2_fail('ROUND_NOT_CLOSED'); end if;
    if p_reason is null or length(trim(p_reason)) not between 3 and 500 then perform public.phase2_fail('INVALID_REASON'); end if;
    if exists(select 1 from public.rounds where event_id=v_event and status='ACTIVE') then perform public.phase2_fail('ACTIVE_ROUND_EXISTS'); end if;
    update public.rounds set status='ACTIVE',closed_at=null where id=p_round;
  else perform public.phase2_fail('INVALID_ROUND'); end if;
  select jsonb_build_object('id',id,'event_id',event_id,'status',status,'started_at',started_at,'closed_at',closed_at,'extension_min',extension_min)
    into v_result from public.rounds where id=p_round;
  if p_action='close_round' then v_result:=v_result||jsonb_build_object('late_match_ids',v_late); end if;
  perform public.audit(v_event,case p_action when 'start_round' then 'ROUND_STARTED' when 'extend_round' then 'ROUND_EXTENDED' when 'close_round' then 'ROUND_CLOSED' else 'ROUND_REOPENED' end,
    'round',p_round,v_before,v_result||jsonb_build_object('reason',p_reason)
      ||case when p_action='start_round' then jsonb_build_object('started_minutes_ago',v_offset) else '{}'::jsonb end);
  perform public.emit(v_event,'round_changed',jsonb_build_object('roundId',p_round));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;
