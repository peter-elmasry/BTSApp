-- Phase 5 live operations. All paths share Phase 2's event transaction lock;
-- operation locks are acquired first, matching existing setup/import RPCs.
create or replace function public.phase5_operation_name(p_rpc text,p_event uuid,p_entity uuid,p_payload jsonb)
returns text language sql immutable set search_path=public,pg_temp
as $$ select p_rpc||':'||p_event::text||':'||p_entity::text||':'||md5(p_payload::text) $$;

create or replace function public.phase5_match_json(p_match uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select jsonb_build_object('id',m.id,'round_id',m.round_id,'game_id',m.game_id,'status',m.status,
    'result_entered_by',m.result_entered_by,'result_entered_at',m.result_entered_at,
    'participants',coalesce((select jsonb_agg(jsonb_build_object('team_id',mp.team_id,'team_code',t.code,
      'side',mp.side,'outcome',mp.outcome) order by mp.side nulls first,t.sort_order,t.code)
      from public.match_participants mp join public.teams t on t.id=mp.team_id and t.event_id=m.event_id
      where mp.match_id=m.id),'[]'::jsonb)) from public.matches m where m.id=p_match
$$;

create or replace function public.phase5_snapshot(p_event uuid,p_matches uuid[] default null)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select public.get_bootstrap(p_event)||jsonb_build_object(
    'event',public.phase4_event_json(e.id)||jsonb_build_object('match_bonus_cap',e.match_bonus_cap,
      'match_penalty_cap',e.match_penalty_cap,'event_bonus_cap',e.event_bonus_cap,'event_penalty_cap',e.event_penalty_cap),
    'matches',coalesce((select jsonb_agg(public.phase5_match_json(m.id) order by r.number,g.code)
      from public.matches m join public.rounds r on r.id=m.round_id join public.games g on g.id=m.game_id
      where m.event_id=p_event and (p_matches is null or m.id=any(p_matches))),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'scope',a.scope,'match_id',a.match_id,
      'team_id',a.team_id,'points',a.points,'reason',a.reason,'created_at',a.created_at,
      'given_by',jsonb_build_object('id',mb.id,'name_en',mb.full_name_en,'name_ar',mb.full_name_ar),
      'revoked_at',a.revoked_at,'revoke_reason',a.revoke_reason) order by a.created_at,a.id)
      from public.adjustments a join public.members mb on mb.id=a.given_by where a.event_id=p_event
        and (p_matches is null or (a.scope='MATCH' and a.match_id=any(p_matches)))),'[]'::jsonb)
  ) from public.events e where e.id=p_event
$$;

create or replace function public.get_live_event(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  return public.phase5_snapshot(p_event);
end $$;

create or replace function public.get_referee_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_matches uuid[]; begin
  if not public.is_staff(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  select coalesce(array_agg(m.id),array[]::uuid[]) into v_matches from public.matches m
    join public.rounds r on r.id=m.round_id where m.event_id=p_event and r.status='ACTIVE'
      and (public.is_event_admin(p_event) or public.is_referee_for_match(m.id));
  return public.phase5_snapshot(p_event,v_matches);
end $$;

create or replace function public.get_match_entry(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_event uuid; begin
  select event_id into v_event from public.matches where id=p_match;
  if v_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) and not public.is_referee_for_match(p_match) then perform public.phase2_fail('FORBIDDEN'); end if;
  return public.phase5_snapshot(v_event,array[p_match]);
end $$;

create or replace function public.get_pending_matches(p_round uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_event uuid; v_result jsonb; begin
  select event_id into v_event from public.rounds where id=p_round;
  if v_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  select coalesce(jsonb_agg(public.phase5_match_json(m.id) order by g.code),'[]'::jsonb) into v_result
    from public.matches m join public.games g on g.id=m.game_id where m.round_id=p_round and m.status='SCHEDULED';
  return v_result;
end $$;

create or replace function public.phase5_round_mutation(p_op_id uuid,p_round uuid,p_action text,p_minutes int default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_event uuid; v_round public.rounds; v_rpc text; v_old jsonb; v_before jsonb; v_result jsonb; v_pending jsonb;
begin
  select event_id into v_event from public.rounds where id=p_round;
  if v_event is null then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name(p_action,v_event,p_round,jsonb_build_object('minutes',p_minutes,'reason',p_reason));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(v_event);
  if not public.is_event_admin(v_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  select * into v_round from public.rounds where id=p_round;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  v_before:=to_jsonb(v_round);
  if p_action='start_round' then
    if v_round.status<>'DRAFT' then perform public.phase2_fail('ROUND_NOT_DRAFT'); end if;
    if exists(select 1 from public.rounds where event_id=v_event and status='ACTIVE') then perform public.phase2_fail('ACTIVE_ROUND_EXISTS'); end if;
    if exists(select 1 from public.matches m where m.round_id=p_round and m.status<>'VOID' and (
        (v_round.type='REGULAR' and ((select count(*) from public.match_participants mp where mp.match_id=m.id)<>2
          or (select count(distinct side) from public.match_participants mp where mp.match_id=m.id)<>2))
        or (v_round.type='OPENING' and ((select count(*) from public.teams where event_id=v_event)<2
          or exists(select 1 from public.teams t where t.event_id=v_event and not exists(select 1 from public.match_participants mp where mp.match_id=m.id and mp.team_id=t.id))
          or (select count(*) from public.match_participants mp where mp.match_id=m.id)<>(select count(*) from public.teams where event_id=v_event)))
      )) or (v_round.type='OPENING' and (select count(*) from public.matches where round_id=p_round)<>1) then
      perform public.phase2_fail('INVALID_ROUND_MATCHES');
    end if;
    update public.rounds set status='ACTIVE',started_at=now(),closed_at=null where id=p_round;
    update public.events set status='LIVE',updated_at=now() where id=v_event and status='DRAFT';
  elsif p_action='extend_round' then
    if v_round.status<>'ACTIVE' then perform public.phase2_fail('ROUND_NOT_ACTIVE'); end if;
    if p_minutes is null or p_minutes not between 1 and 120 then perform public.phase2_fail('INVALID_MINUTES'); end if;
    update public.rounds set extension_min=extension_min+p_minutes where id=p_round;
  elsif p_action='close_round' then
    if v_round.status<>'ACTIVE' then perform public.phase2_fail('ROUND_NOT_ACTIVE'); end if;
    select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into v_pending from public.matches where round_id=p_round and status='SCHEDULED';
    if v_pending<>'[]'::jsonb then perform public.phase2_fail('PENDING_MATCHES',jsonb_build_object('match_ids',v_pending)); end if;
    update public.rounds set status='CLOSED',closed_at=now() where id=p_round;
  elsif p_action='reopen_round' then
    if v_round.status<>'CLOSED' then perform public.phase2_fail('ROUND_NOT_CLOSED'); end if;
    if p_reason is null or length(trim(p_reason)) not between 3 and 500 then perform public.phase2_fail('INVALID_REASON'); end if;
    if exists(select 1 from public.rounds where event_id=v_event and status='ACTIVE') then perform public.phase2_fail('ACTIVE_ROUND_EXISTS'); end if;
    update public.rounds set status='ACTIVE',closed_at=null where id=p_round;
  else perform public.phase2_fail('INVALID_ROUND'); end if;
  select jsonb_build_object('id',id,'event_id',event_id,'status',status,'started_at',started_at,'closed_at',closed_at,'extension_min',extension_min) into v_result from public.rounds where id=p_round;
  perform public.audit(v_event,case p_action when 'start_round' then 'ROUND_STARTED' when 'extend_round' then 'ROUND_EXTENDED' when 'close_round' then 'ROUND_CLOSED' else 'ROUND_REOPENED' end,
    'round',p_round,v_before,v_result||jsonb_build_object('reason',p_reason));
  perform public.emit(v_event,'round_changed',jsonb_build_object('roundId',p_round));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

create or replace function public.start_round(p_op_id uuid,p_round uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'start_round') $$;
create or replace function public.extend_round(p_op_id uuid,p_round uuid,p_minutes int) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'extend_round',p_minutes) $$;
create or replace function public.close_round(p_op_id uuid,p_round uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'close_round') $$;
create or replace function public.reopen_round(p_op_id uuid,p_round uuid,p_reason text) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_round_mutation(p_op_id,p_round,'reopen_round',null,p_reason) $$;

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
  if not public.is_event_admin(v_event) and v_round.status<>'ACTIVE' then perform public.phase2_fail('ROUND_NOT_ACTIVE'); end if;
  v_before:=public.phase5_match_json(p_match); v_status:=v_before->>'status'; v_correcting:=v_status='COMPLETED';
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

create or replace function public.submit_match_result(p_op_id uuid,p_match uuid,p_outcomes jsonb) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_match_mutation(p_op_id,p_match,'submit_match_result',p_outcomes) $$;
create or replace function public.reset_match_result(p_op_id uuid,p_match uuid) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_match_mutation(p_op_id,p_match,'reset_match_result') $$;
create or replace function public.void_match(p_op_id uuid,p_match uuid,p_reason text) returns jsonb
language sql security definer set search_path=public,pg_temp as $$ select public.phase5_match_mutation(p_op_id,p_match,'void_match',null,p_reason) $$;

create or replace function public.add_adjustment(p_op_id uuid,p_event uuid,p_scope text,p_match uuid,p_team uuid,p_points int,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_rpc text; v_old jsonb; v_cap int; v_used bigint; v_id uuid; v_result jsonb; v_round uuid;
begin
  if not public.is_event_admin(p_event) and (p_scope is distinct from 'MATCH' or not public.is_referee_for_match(p_match)
      or not exists(select 1 from public.matches where id=p_match and event_id=p_event)) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name('add_adjustment',p_event,p_team,jsonb_build_object('scope',p_scope,'match',p_match,'points',p_points,'reason',p_reason));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) and (p_scope is distinct from 'MATCH' or not public.is_referee_for_match(p_match)
      or not exists(select 1 from public.matches where id=p_match and event_id=p_event)) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_scope is null or p_scope not in ('MATCH','EVENT') or (p_scope='MATCH')<>(p_match is not null)
      or p_points is null or p_points=0 or p_reason is null or length(trim(p_reason)) not between 3 and 500
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
  select coalesce(sum(abs(points::bigint)),0) into v_used from public.adjustments
    where event_id=p_event and team_id=p_team and scope=p_scope and match_id is not distinct from p_match
      and revoked_at is null and (points>0)=(p_points>0);
  if v_cap is not null and v_used+abs(p_points::bigint)>v_cap then perform public.phase2_fail('CAP_EXCEEDED',jsonb_build_object('remaining',greatest(v_cap-v_used,0))); end if;
  insert into public.adjustments(event_id,scope,match_id,team_id,points,reason,given_by)
    values(p_event,p_scope,p_match,p_team,p_points,trim(p_reason),public.current_member_id()) returning id into v_id;
  v_result:=jsonb_build_object('id',v_id,'event_id',p_event,'scope',p_scope,'match_id',p_match,'team_id',p_team,'points',p_points,'reason',trim(p_reason));
  perform public.audit(p_event,'ADJUSTMENT_ADDED','adjustment',v_id,null,v_result);
  perform public.emit(p_event,'adjustment_changed',jsonb_build_object('matchId',p_match,'roundId',v_round));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

create or replace function public.revoke_adjustment(p_op_id uuid,p_adjustment uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_adjustment public.adjustments; v_rpc text; v_old jsonb; v_result jsonb; v_round uuid;
begin
  select * into v_adjustment from public.adjustments where id=p_adjustment;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_adjustment.event_id) and (v_adjustment.scope<>'MATCH'
      or v_adjustment.given_by is distinct from public.current_member_id() or not public.is_referee_for_match(v_adjustment.match_id)) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name('revoke_adjustment',v_adjustment.event_id,p_adjustment,jsonb_build_object('reason',p_reason));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(v_adjustment.event_id);
  select * into v_adjustment from public.adjustments where id=p_adjustment;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.is_event_admin(v_adjustment.event_id) and (v_adjustment.scope<>'MATCH'
      or v_adjustment.given_by is distinct from public.current_member_id() or not public.is_referee_for_match(v_adjustment.match_id)) then perform public.phase2_fail('FORBIDDEN'); end if;
  select round_id into v_round from public.matches where id=v_adjustment.match_id;
  if not public.is_event_admin(v_adjustment.event_id) and not exists(select 1 from public.rounds where id=v_round and status='ACTIVE') then perform public.phase2_fail('ROUND_NOT_ACTIVE'); end if;
  if v_adjustment.revoked_at is not null then perform public.phase2_fail('ADJUSTMENT_REVOKED'); end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then perform public.phase2_fail('INVALID_REASON'); end if;
  update public.adjustments set revoked_at=now(),revoked_by=public.current_member_id(),revoke_reason=trim(p_reason) where id=p_adjustment;
  v_result:=jsonb_build_object('id',p_adjustment,'event_id',v_adjustment.event_id,'revoked',true,'revoke_reason',trim(p_reason));
  perform public.audit(v_adjustment.event_id,'ADJUSTMENT_REVOKED','adjustment',p_adjustment,to_jsonb(v_adjustment),v_result);
  perform public.emit(v_adjustment.event_id,'adjustment_changed',jsonb_build_object('matchId',v_adjustment.match_id,'roundId',v_round));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

revoke execute on function public.phase5_operation_name(text,uuid,uuid,jsonb),public.phase5_match_json(uuid),public.phase5_snapshot(uuid,uuid[]),
  public.phase5_round_mutation(uuid,uuid,text,int,text),public.phase5_match_mutation(uuid,uuid,text,jsonb,text),
  public.get_live_event(uuid),public.get_referee_board(uuid),public.get_match_entry(uuid),public.get_pending_matches(uuid),
  public.start_round(uuid,uuid),public.extend_round(uuid,uuid,int),public.close_round(uuid,uuid),public.reopen_round(uuid,uuid,text),
  public.submit_match_result(uuid,uuid,jsonb),public.reset_match_result(uuid,uuid),public.void_match(uuid,uuid,text),
  public.add_adjustment(uuid,uuid,text,uuid,uuid,int,text),public.revoke_adjustment(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_live_event(uuid),public.get_referee_board(uuid),public.get_match_entry(uuid),public.get_pending_matches(uuid),
  public.start_round(uuid,uuid),public.extend_round(uuid,uuid,int),public.close_round(uuid,uuid),public.reopen_round(uuid,uuid,text),
  public.submit_match_result(uuid,uuid,jsonb),public.reset_match_result(uuid,uuid),public.void_match(uuid,uuid,text),
  public.add_adjustment(uuid,uuid,text,uuid,uuid,int,text),public.revoke_adjustment(uuid,uuid,text)
  to authenticated,service_role;
