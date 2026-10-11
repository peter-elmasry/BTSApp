-- Computed standings: current points, completed outcomes and active adjustments.
-- Internal helpers remain unavailable to clients; domain-table grants are unchanged.
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
    'team',public.phase4_team_json(id)#-'{guide,phone}',
    'played',played,'wins',wins,'draws',draws,'losses',losses,'forfeits',forfeits,
    'match_points',match_points,'adjustment_points',adjustment_points,'total',total,
    'is_tied',cohort_size>1 and not has_resolution,
    'final_tiebreak_pos',case when has_resolution then final_tiebreak_pos else null end)
    order by total desc,case when has_resolution then final_tiebreak_pos else null end nulls last,name_en,code,id),'[]'::jsonb)
  from ranked
$$;

create or replace function public.get_standings(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.can_see_results(p_event) then perform public.phase2_fail('LEADERBOARD_HIDDEN'); end if;
  return public.phase6_standings(p_event);
end $$;

create or replace function public.get_schedule(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_result jsonb; begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  v_result:=public.phase4_matches_json(p_event);
  if public.can_see_results(p_event) then
    select coalesce(jsonb_agg(x.value||jsonb_build_object('result_entered_at',m.result_entered_at) order by x.ordinality),'[]'::jsonb)
      into v_result from jsonb_array_elements(v_result) with ordinality x(value,ordinality)
      join public.matches m on m.id=(x.value->>'id')::uuid;
  end if;
  return v_result;
end $$;

-- Conservatively invalidate every manual group in an event when its scoring or
-- roster changes. A position-only update by set_tiebreak must not invalidate itself.
create or replace function public.phase6_invalidate_ties()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_event uuid; v_old_event uuid; begin
  if tg_table_name='events' then
    if (new.points_win,new.points_draw,new.points_loss) is not distinct from (old.points_win,old.points_draw,old.points_loss) then return null; end if;
    v_event:=new.id;
  elsif tg_table_name='teams' then
    if tg_op='UPDATE' and (to_jsonb(new)-'final_tiebreak_pos') is not distinct from (to_jsonb(old)-'final_tiebreak_pos') then return null; end if;
    if tg_op<>'DELETE' then v_event:=new.event_id; end if;
    if tg_op<>'INSERT' then v_old_event:=old.event_id; end if;
  elsif tg_table_name='match_participants' then
    if tg_op<>'DELETE' then select event_id into v_event from public.matches where id=new.match_id; end if;
    if tg_op<>'INSERT' then select event_id into v_old_event from public.matches where id=old.match_id; end if;
  else
    if tg_op<>'DELETE' then v_event:=new.event_id; end if;
    if tg_op<>'INSERT' then v_old_event:=old.event_id; end if;
  end if;
  update public.teams set final_tiebreak_pos=null where event_id in (v_event,v_old_event) and final_tiebreak_pos is not null;
  return null;
end $$;
create trigger phase6_points_invalidate after update of points_win,points_draw,points_loss on public.events
for each row execute function public.phase6_invalidate_ties();
create trigger phase6_teams_invalidate after insert or update or delete on public.teams
for each row execute function public.phase6_invalidate_ties();
create trigger phase6_matches_invalidate after insert or update or delete on public.matches
for each row execute function public.phase6_invalidate_ties();
create trigger phase6_outcomes_invalidate after insert or update or delete on public.match_participants
for each row execute function public.phase6_invalidate_ties();
create trigger phase6_adjustments_invalidate after insert or update or delete on public.adjustments
for each row execute function public.phase6_invalidate_ties();

create or replace function public.set_tiebreak(p_op_id uuid,p_event uuid,p_team_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_rpc text; v_old jsonb; v_rows jsonb; v_before jsonb; v_result jsonb;
  v_total bigint; v_group uuid[]; v_supplied uuid[]; begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name('set_tiebreak',p_event,p_event,jsonb_build_object('team_ids',p_team_ids));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  if p_team_ids is null or cardinality(p_team_ids)<2 or array_ndims(p_team_ids)<>1 then
    perform public.phase2_fail('INVALID_TIEBREAK');
  end if;
  if array_position(p_team_ids,null) is not null
      or (select count(distinct id) from unnest(p_team_ids) id)<>cardinality(p_team_ids) then
    perform public.phase2_fail('INVALID_TIEBREAK');
  end if;
  v_rows:=public.phase6_standings(p_event);
  select (x->>'total')::bigint into v_total from jsonb_array_elements(v_rows) x where x->'team'->>'id'=p_team_ids[array_lower(p_team_ids,1)]::text;
  if v_total is null then perform public.phase2_fail('INVALID_TIEBREAK'); end if;
  select array_agg((x->'team'->>'id')::uuid order by x->'team'->>'id') into v_group
    from jsonb_array_elements(v_rows) x where (x->>'total')::bigint=v_total;
  select array_agg(id order by id) into v_supplied from unnest(p_team_ids) id;
  if v_supplied is distinct from v_group then perform public.phase2_fail('INVALID_TIEBREAK'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('team_id',id,'position',final_tiebreak_pos) order by id),'[]'::jsonb)
    into v_before from public.teams where id=any(p_team_ids);
  update public.teams t set final_tiebreak_pos=x.position::int
    from unnest(p_team_ids) with ordinality x(id,position) where t.id=x.id and t.event_id=p_event;
  v_result:=jsonb_build_object('event_id',p_event,'team_ids',to_jsonb(p_team_ids),'standings',public.phase6_standings(p_event));
  perform public.audit(p_event,'TIEBREAK_SET','event',p_event,v_before,jsonb_build_object('team_ids',p_team_ids,'total',v_total));
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

create or replace function public.set_leaderboard_visibility(p_op_id uuid,p_event uuid,p_public boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_rpc text; v_old jsonb; v_before boolean; v_result jsonb; begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name('set_leaderboard_visibility',p_event,p_event,jsonb_build_object('public',p_public));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  select leaderboard_public into v_before from public.events where id=p_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if p_public is null then perform public.phase2_fail('INVALID_VISIBILITY'); end if;
  update public.events set leaderboard_public=p_public,updated_at=now() where id=p_event;
  v_result:=jsonb_build_object('event_id',p_event,'leaderboard_public',p_public);
  perform public.audit(p_event,'LEADERBOARD_VISIBILITY_SET','event',p_event,jsonb_build_object('leaderboard_public',v_before),v_result);
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

create or replace function public.get_export_data(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_result jsonb; begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  -- STABLE uses one statement snapshot for all nested builders and aggregates.
  select jsonb_build_object('event',public.phase4_event_json(p_event),'generated_at',statement_timestamp(),
    'standings',public.phase6_standings(p_event),
    'matches',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'round_number',r.number,'round_type',r.type,'game_code',g.code,'game_name_en',g.name_en,'game_name_ar',g.name_ar,'status',m.status,
      'participants',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,'outcome',mp.outcome)
        order by mp.side nulls first,t.sort_order,t.code) from public.match_participants mp join public.teams t on t.id=mp.team_id where mp.match_id=m.id),'[]'::jsonb),
      'entered_by',(select jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar) from public.members mb where mb.id=m.result_entered_by),
      'result_entered_at',m.result_entered_at) order by r.number,g.code,m.id)
      from public.matches m join public.rounds r on r.id=m.round_id join public.games g on g.id=m.game_id where m.event_id=p_event),'[]'::jsonb),
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

-- Preserve Phase 4 fields and own-team outcome access. A standing is present
-- only when the same visibility rule allows the complete leaderboard.
create or replace function public.get_team_view(p_event uuid,p_team_code text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_team uuid; v_result jsonb; begin
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  select id into v_team from public.teams where event_id=p_event and code=upper(trim(p_team_code));
  if v_team is null then perform public.phase2_fail('NOT_FOUND'); end if;
  v_result:=jsonb_build_object('team',public.phase4_team_json(v_team),'matches',public.phase4_matches_json(p_event,v_team),
    'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'scope',a.scope,'match_id',a.match_id,'points',a.points,'reason',a.reason,
      'given_by',jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar),'created_at',a.created_at) order by a.created_at,a.id)
      from public.adjustments a join public.members mb on mb.id=a.given_by where a.event_id=p_event and a.team_id=v_team and a.revoked_at is null),'[]'::jsonb));
  if public.can_see_results(p_event) then
    v_result:=v_result||jsonb_build_object('standing',(select x from jsonb_array_elements(public.phase6_standings(p_event)) x where x->'team'->>'id'=v_team::text));
  end if;
  return v_result;
end $$;

revoke execute on function public.phase6_standings(uuid),public.phase6_invalidate_ties(),public.get_standings(uuid),
  public.set_tiebreak(uuid,uuid,uuid[]),public.set_leaderboard_visibility(uuid,uuid,boolean),public.get_export_data(uuid)
  from public,anon,authenticated;
grant execute on function public.get_standings(uuid) to anon,authenticated,service_role;
grant execute on function public.set_tiebreak(uuid,uuid,uuid[]),public.set_leaderboard_visibility(uuid,uuid,boolean),public.get_export_data(uuid)
  to authenticated,service_role;
