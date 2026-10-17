-- D075: edit amounts on the same adjustment, preserving append-only revision history.
alter table public.adjustments add column revision int not null default 0 check(revision>=0);
create table public.adjustment_revisions (
 adjustment_id uuid not null references public.adjustments(id) on delete cascade,
 revision int not null check(revision>0),
 old_points numeric not null,
 new_points numeric not null,
 reason text not null check(length(trim(reason)) between 3 and 500),
 changed_by uuid not null references public.members(id),
 changed_at timestamptz not null default clock_timestamp(),
 primary key(adjustment_id,revision)
);
alter table public.adjustment_revisions enable row level security;
revoke all on public.adjustment_revisions from public,anon,authenticated;

create function public.can_manage_adjustment(p_event uuid,p_issuer uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(public.is_event_admin(p_event) or (p_issuer is not null and p_issuer=public.current_member_id()),false)
$$;
create function public.adjustment_history_json(p_adjustment uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('revision',r.revision,'old_points',r.old_points,'new_points',r.new_points,
  'reason',r.reason,'changed_at',r.changed_at,'changed_by',jsonb_build_object('name_en',m.full_name_en,'name_ar',m.full_name_ar))
  order by r.revision),'[]'::jsonb)
 from public.adjustment_revisions r join public.members m on m.id=r.changed_by where r.adjustment_id=p_adjustment
$$;
revoke execute on function public.can_manage_adjustment(uuid,uuid),public.adjustment_history_json(uuid) from public,anon,authenticated;

create function public.edit_adjustment(p_op_id uuid,p_adjustment uuid,p_points numeric,p_reason text,p_expected_revision int)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.adjustments; v_rpc text; v_old jsonb; v_cap int; v_used numeric; v_result jsonb; v_round uuid;
begin
 select * into v_row from public.adjustments where id=p_adjustment;
 if not found then perform public.phase2_fail('NOT_FOUND'); end if;
 if not public.can_manage_adjustment(v_row.event_id,v_row.given_by) then perform public.phase2_fail('FORBIDDEN'); end if;
 v_rpc:=public.phase5_operation_name('edit_adjustment',v_row.event_id,p_adjustment,jsonb_build_object('points',p_points,'reason',p_reason,'revision',p_expected_revision));
 v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
 perform public.phase2_event_lock(v_row.event_id);
 select * into v_row from public.adjustments where id=p_adjustment;
 if not found then perform public.phase2_fail('NOT_FOUND'); end if;
 if not public.can_manage_adjustment(v_row.event_id,v_row.given_by) then perform public.phase2_fail('FORBIDDEN'); end if;
 if v_row.revoked_at is not null then perform public.phase2_fail('ADJUSTMENT_REVOKED'); end if;
 if p_expected_revision is null or p_expected_revision<>v_row.revision then perform public.phase2_fail('ADJUSTMENT_CHANGED'); end if;
 if p_points is null or p_points=0 or p_points::text in ('NaN','Infinity','-Infinity')
  or p_points not between -2147483648 and 2147483647 or p_points<>round(p_points,2) or p_points=v_row.points then
  perform public.phase2_fail('INVALID_ADJUSTMENT'); end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 500 then perform public.phase2_fail('INVALID_REASON'); end if;
 select case when v_row.scope='MATCH' then case when p_points>0 then match_bonus_cap else match_penalty_cap end
  else case when p_points>0 then event_bonus_cap else event_penalty_cap end end into v_cap from public.events where id=v_row.event_id;
 select coalesce(sum(abs(points)),0) into v_used from public.adjustments where id<>p_adjustment
  and event_id=v_row.event_id and team_id=v_row.team_id and scope=v_row.scope
  and match_id is not distinct from v_row.match_id and revoked_at is null and (points>0)=(p_points>0);
 if v_cap is not null and v_used+abs(p_points)>v_cap then perform public.phase2_fail('CAP_EXCEEDED',jsonb_build_object('remaining',greatest(v_cap-v_used,0))); end if;
 insert into public.adjustment_revisions(adjustment_id,revision,old_points,new_points,reason,changed_by)
  values(p_adjustment,v_row.revision+1,v_row.points,p_points,trim(p_reason),public.current_member_id());
 update public.adjustments set points=p_points,revision=revision+1 where id=p_adjustment;
 v_result:=jsonb_build_object('id',p_adjustment,'event_id',v_row.event_id,'points',p_points,'revision',v_row.revision+1);
 select round_id into v_round from public.matches where id=v_row.match_id;
 perform public.audit(v_row.event_id,'ADJUSTMENT_EDITED','adjustment',p_adjustment,to_jsonb(v_row),v_result||jsonb_build_object('correction_reason',trim(p_reason)));
 perform public.emit(v_row.event_id,'adjustment_changed',jsonb_build_object('matchId',v_row.match_id,'roundId',v_round));
 return public.op_complete(p_op_id,v_rpc,v_result);
end $$;
revoke execute on function public.edit_adjustment(uuid,uuid,numeric,text,int) from public,anon,authenticated;
grant execute on function public.edit_adjustment(uuid,uuid,numeric,text,int) to authenticated,service_role;

create or replace function public.revoke_adjustment(p_op_id uuid,p_adjustment uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_adjustment public.adjustments; v_rpc text; v_old jsonb; v_result jsonb; v_round uuid;
begin
  select * into v_adjustment from public.adjustments where id=p_adjustment;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.can_manage_adjustment(v_adjustment.event_id,v_adjustment.given_by) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name('revoke_adjustment',v_adjustment.event_id,p_adjustment,jsonb_build_object('reason',p_reason));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(v_adjustment.event_id);
  select * into v_adjustment from public.adjustments where id=p_adjustment;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if not public.can_manage_adjustment(v_adjustment.event_id,v_adjustment.given_by) then perform public.phase2_fail('FORBIDDEN'); end if;
  select round_id into v_round from public.matches where id=v_adjustment.match_id;
  if v_adjustment.revoked_at is not null then perform public.phase2_fail('ADJUSTMENT_REVOKED'); end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then perform public.phase2_fail('INVALID_REASON'); end if;
  update public.adjustments set revoked_at=now(),revoked_by=public.current_member_id(),revoke_reason=trim(p_reason) where id=p_adjustment;
  v_result:=jsonb_build_object('id',p_adjustment,'event_id',v_adjustment.event_id,'revoked',true,'revoke_reason',trim(p_reason));
  perform public.audit(v_adjustment.event_id,'ADJUSTMENT_REVOKED','adjustment',p_adjustment,to_jsonb(v_adjustment),v_result);
  perform public.emit(v_adjustment.event_id,'adjustment_changed',jsonb_build_object('matchId',v_adjustment.match_id,'roundId',v_round));
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

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
      'revoked_at',a.revoked_at,'revoke_reason',a.revoke_reason,'revision',a.revision,'history',public.adjustment_history_json(a.id)) order by a.created_at,a.id)
      from public.adjustments a join public.members mb on mb.id=a.given_by where a.event_id=p_event
        and (p_matches is null or (a.scope='MATCH' and a.match_id=any(p_matches)))),'[]'::jsonb)
  ) from public.events e where e.id=p_event
$$;

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
      'given_by',jsonb_build_object('name_en',mb.full_name_en,'name_ar',mb.full_name_ar),'created_at',a.created_at,'revoked_at',a.revoked_at,'revoke_reason',a.revoke_reason,'revision',a.revision,'history',public.adjustment_history_json(a.id))
      order by a.created_at,a.id) from public.adjustments a join public.teams t on t.id=a.team_id join public.members mb on mb.id=a.given_by where a.event_id=p_event),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('member_id',mb.id,'username',mb.username,'name_en',mb.full_name_en,'name_ar',mb.full_name_ar,
      'role',er.role,'team_code',t.code,'game_codes',coalesce((select jsonb_agg(g.code order by g.code) from public.referee_games rg join public.games g on g.id=rg.game_id
        where rg.event_id=p_event and rg.member_id=mb.id and er.role='REFEREE'),'[]'::jsonb)) order by er.role,mb.full_name_en,mb.id)
      from public.event_roles er join public.members mb on mb.id=er.member_id left join public.teams t on t.id=er.team_id where er.event_id=p_event),'[]'::jsonb)) into v_result;
  return v_result;
end $$;

