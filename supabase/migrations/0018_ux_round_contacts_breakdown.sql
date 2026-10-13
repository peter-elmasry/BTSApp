-- UX enhancement U3 (D041–D043): end a round with late results, backdated round
-- start, late first results by referees, role-scoped staff contacts and a scoring-mode
-- aware team breakdown. Builds on 0008 (live), 0009 (team view), 0016 (bootstrap) and
-- 0017 (lives standings).

-- 1. Round lifecycle: "End round" keeps pending matches as late results (D041) and
--    "start" accepts "started X minutes ago" (D042).
drop function if exists public.phase5_round_mutation(uuid,uuid,text,int,text);
create function public.phase5_round_mutation(p_op_id uuid,p_round uuid,p_action text,p_minutes int default null,
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
    select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into v_late from public.matches where round_id=p_round and status='SCHEDULED';
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

create or replace function public.start_round(p_op_id uuid,p_round uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'start_round') $$;
create function public.start_round(p_op_id uuid,p_round uuid,p_started_minutes_ago int) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'start_round',null,null,p_started_minutes_ago) $$;
create or replace function public.extend_round(p_op_id uuid,p_round uuid,p_minutes int) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'extend_round',p_minutes) $$;
create or replace function public.close_round(p_op_id uuid,p_round uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'close_round') $$;
create or replace function public.reopen_round(p_op_id uuid,p_round uuid,p_reason text) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'reopen_round',null,p_reason) $$;

-- 2. Late first results by the assigned referee (D041).
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

-- 3. Public round data counts late results without revealing outcomes (D041 footnote).
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
        and now()>r.started_at+make_interval(mins=>r.duration_min+r.extension_min),
      -- D041: matches still without a result after the round ended (no outcomes revealed).
      'late_count',case when r.status='CLOSED' then (select count(*) from public.matches m
        where m.round_id=r.id and m.status='SCHEDULED') else 0 end
    ) order by r.number) from public.rounds r where r.event_id=p_event),'[]'::jsonb)
  );
end $$;

-- 4. Role-scoped staff contacts (D043). Phones leave the database only through these
--    staff reads; public reads keep names only (D036).
create function public.ux_team_guides_json(p_event uuid,p_teams uuid[] default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('team_id',er.team_id,'member_id',mb.id,
    'name_en',mb.full_name_en,'name_ar',mb.full_name_ar,'phone',mb.phone) order by mb.full_name_en,mb.id),'[]'::jsonb)
  from public.event_roles er join public.members mb on mb.id=er.member_id and mb.is_active
  where er.event_id=p_event and er.role='GUIDE' and (p_teams is null or er.team_id=any(p_teams))
$$;

create function public.ux_game_referees_json(p_event uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('game_id',rg.game_id,'member_id',mb.id,
    'name_en',mb.full_name_en,'name_ar',mb.full_name_ar,'phone',mb.phone) order by g.code,mb.full_name_en,mb.id),'[]'::jsonb)
  from public.referee_games rg
    join public.games g on g.id=rg.game_id and g.event_id=rg.event_id
    join public.members mb on mb.id=rg.member_id and mb.is_active
  where rg.event_id=p_event and exists(select 1 from public.event_roles er
    where er.event_id=rg.event_id and er.member_id=rg.member_id and er.role='REFEREE')
$$;

create or replace function public.get_live_event(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  return public.phase5_snapshot(p_event)||jsonb_build_object(
    'game_referee_contacts',public.ux_game_referees_json(p_event),
    'team_guides',public.ux_team_guides_json(p_event));
end $$;

-- Referees see their current, upcoming and late matches; guides of the teams involved.
create or replace function public.get_referee_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_matches uuid[]; v_admin boolean; v_result jsonb; begin
  if not public.is_staff(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  v_admin:=public.is_event_admin(p_event);
  select coalesce(array_agg(m.id),array[]::uuid[]) into v_matches from public.matches m
    join public.rounds r on r.id=m.round_id
    where m.event_id=p_event and (v_admin or public.is_referee_for_match(m.id))
      and (r.status in ('DRAFT','ACTIVE') or (r.status='CLOSED' and m.status='SCHEDULED'));
  v_result:=public.phase5_snapshot(p_event,v_matches);
  v_result:=jsonb_set(v_result,'{matches}',coalesce((select jsonb_agg(x||jsonb_build_object(
      'bucket',case r.status when 'ACTIVE' then 'current' when 'DRAFT' then 'upcoming' else 'late' end,
      'editable',v_admin or r.status='ACTIVE' or (r.status='CLOSED' and m.status='SCHEDULED')) order by e.ord)
    from jsonb_array_elements(v_result->'matches') with ordinality e(x,ord)
      join public.matches m on m.id=(e.x->>'id')::uuid join public.rounds r on r.id=m.round_id),'[]'::jsonb));
  return v_result||jsonb_build_object('team_guides',public.ux_team_guides_json(p_event,
    (select coalesce(array_agg(distinct mp.team_id),array[]::uuid[]) from public.match_participants mp where mp.match_id=any(v_matches))));
end $$;

-- Guides, referees and administrators of the event can call its administrators.
create function public.get_event_contacts(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_member uuid:=public.current_member_id(); begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  if v_member is null or not (public.is_owner() or exists(select 1 from public.event_roles er
      where er.event_id=p_event and er.member_id=v_member)) then
    perform public.phase2_fail('FORBIDDEN');
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('member_id',mb.id,'name_en',mb.full_name_en,
      'name_ar',mb.full_name_ar,'phone',mb.phone) order by mb.full_name_en,mb.id)
    from public.members mb where mb.is_active and mb.phone is not null and exists(select 1 from public.event_roles er
      where er.event_id=p_event and er.member_id=mb.id and er.role='EVENT_ADMIN')),'[]'::jsonb);
end $$;

-- 5. Team breakdown (A7): per-match points or lives and subtotals from the same
--    standings computation, so the drill-down always reconciles with the table.
create function public.ux_team_breakdown(p_event uuid,p_team uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  with e as (select * from public.events where id=p_event),
  standing_row as (select x from jsonb_array_elements(public.phase6_standings(p_event)) x where x->'team'->>'id'=p_team::text),
  per_match as (
    select m.id,case when m.status<>'COMPLETED' then 0
      when e.scoring_mode='LIVES' then case when mp.outcome in ('LOSS','FORFEIT') then -1 else 0 end
      else case mp.outcome when 'WIN' then e.points_win when 'DRAW' then e.points_draw
        when 'LOSS' then e.points_loss when 'FORFEIT' then e.points_loss else 0 end end as value
    from public.match_participants mp join public.matches m on m.id=mp.match_id and m.event_id=p_event cross join e
    where mp.team_id=p_team
  )
  select jsonb_build_object(
    'scoring_mode',e.scoring_mode,'initial_lives',e.initial_lives,
    'match_points',(select (x->>'match_points')::bigint from standing_row),
    'adjustment_points',(select (x->>'adjustment_points')::bigint from standing_row),
    'total',(select (x->>'total')::bigint from standing_row),
    'lives_lost',case when e.scoring_mode='LIVES' then (select (x->>'losses')::bigint+(x->>'forfeits')::bigint from standing_row) else null end,
    'match_values',coalesce((select jsonb_object_agg(id::text,value) from per_match),'{}'::jsonb))
  from e
$$;

create or replace function public.get_team_view(p_event uuid,p_team_code text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_team uuid; v_result jsonb; v_breakdown jsonb; begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  select id into v_team from public.teams where event_id=p_event and code=upper(trim(p_team_code));
  if v_team is null then perform public.phase2_fail('NOT_FOUND'); end if;
  v_breakdown:=public.ux_team_breakdown(p_event,v_team);
  v_result:=jsonb_build_object('team',public.phase4_team_json(v_team),
    'matches',coalesce((select jsonb_agg(x||case when v_breakdown->>'scoring_mode'='LIVES'
        then jsonb_build_object('lives_delta',v_breakdown->'match_values'->(x->>'id'))
        else jsonb_build_object('points',v_breakdown->'match_values'->(x->>'id')) end order by e.ord)
      from jsonb_array_elements(public.phase4_matches_json(p_event,v_team)) with ordinality e(x,ord)),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'scope',a.scope,'match_id',a.match_id,'points',a.points,'reason',a.reason,
      'given_by',jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar),'created_at',a.created_at) order by a.created_at,a.id)
      from public.adjustments a join public.members mb on mb.id=a.given_by where a.event_id=p_event and a.team_id=v_team and a.revoked_at is null),'[]'::jsonb),
    'breakdown',v_breakdown-'match_values');
  if public.can_see_results(p_event) then
    v_result:=v_result||jsonb_build_object('standing',(select x from jsonb_array_elements(public.phase6_standings(p_event)) x where x->'team'->>'id'=v_team::text));
  end if;
  return v_result;
end $$;

-- 6. Privileges: helpers stay internal; new RPCs are for signed-in members only.
revoke execute on function public.phase5_round_mutation(uuid,uuid,text,int,text,int),
  public.ux_team_guides_json(uuid,uuid[]),public.ux_game_referees_json(uuid),public.ux_team_breakdown(uuid,uuid),
  public.start_round(uuid,uuid,int),public.get_event_contacts(uuid)
  from public,anon,authenticated;
grant execute on function public.start_round(uuid,uuid,int),public.get_event_contacts(uuid) to authenticated,service_role;
