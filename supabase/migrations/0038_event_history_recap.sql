-- D077: event classification, completed PROD participation and private recap.
alter table public.events add column event_type text not null default 'PROD'
  check (event_type in ('PROD','TEST'));
alter table public.events add column finished_at timestamptz;
alter table public.events add column finished_by uuid references public.members(id);

-- Classify only the existing rows. Abort ambiguous naming rather than guessing an ID.
do $$ begin
  if (select count(*) from public.events where btrim(name_en)='بدل تالف' or btrim(name_ar)='بدل تالف')>1 then
    raise exception 'AMBIGUOUS_LEGACY_PROD_EVENT';
  end if;
  if exists(select 1 from public.events) and not exists(select 1 from public.events where btrim(name_en)='بدل تالف' or btrim(name_ar)='بدل تالف') then
    raise exception 'LEGACY_PROD_EVENT_NOT_FOUND';
  end if;
end $$;
update public.events set event_type=case when btrim(name_en)='بدل تالف' or btrim(name_ar)='بدل تالف' then 'PROD' else 'TEST' end;

create function public.event_completion_blockers(p_event uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'round_ids',coalesce((select jsonb_agg(id order by number) from public.rounds where event_id=p_event and status<>'CLOSED'),'[]'::jsonb),
    'match_ids',coalesce((select jsonb_agg(m.id order by m.round_id,m.id) from public.neutral_matches m
      where m.event_id=p_event and m.status<>'VOID' and (m.status<>'COMPLETED'
        or not exists(select 1 from public.neutral_participants mp where mp.match_id=m.id)
        or exists(select 1 from public.neutral_participants mp where mp.match_id=m.id and mp.outcome='PENDING'))),'[]'::jsonb))
$$;

-- Existing events are finished only where the required completion evidence exists.
-- Incomplete legacy events remain visible with explicit blockers in their recap.
update public.events e set status='FINISHED',registration_open=false,finished_at=now()
where public.event_completion_blockers(e.id)='{"round_ids":[],"match_ids":[]}'::jsonb;
do $$ declare v_ids jsonb; begin
  select jsonb_agg(id order by id) into v_ids from public.events where public.event_completion_blockers(id)<>'{"round_ids":[],"match_ids":[]}'::jsonb;
  if v_ids is not null then raise warning 'Incomplete legacy events require closed rounds/results before finish: %',v_ids; end if;
end $$;

create or replace function public.phase4_event_json(p_event uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'id',e.id,'code',e.code,'name_en',e.name_en,'name_ar',e.name_ar,'status',e.status,
    'event_type',e.event_type,'finished_at',e.finished_at,
    'starts_on',e.starts_on,'leaderboard_public',e.leaderboard_public,'show_guide_phone',e.show_guide_phone,
    'points_win',e.points_win,'points_draw',e.points_draw,'points_loss',e.points_loss,
    'currency_en_one',e.currency_en_one,'currency_en_other',e.currency_en_other,
    'currency_ar_one',e.currency_ar_one,'currency_ar_two',e.currency_ar_two,'currency_ar_plural',e.currency_ar_plural,
    'scoring_mode',e.scoring_mode,'initial_lives',e.initial_lives,'life_emoji',e.life_emoji,'audio_config',e.audio_config
  ) from public.events e where e.id=p_event
$$;

create or replace function public.list_events() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$ begin
  if not public.is_owner() then perform public.phase2_fail('FORBIDDEN'); end if;
  return coalesce((select jsonb_agg(public.phase4_event_json(e.id)||jsonb_build_object('is_current',e.is_current,
    'admin_ids',coalesce((select jsonb_agg(member_id order by created_at) from public.event_roles where event_id=e.id and role='EVENT_ADMIN'),'[]'::jsonb))
    order by e.created_at desc,e.id) from public.events e),'[]'::jsonb);
end $$;

create function public.create_typed_event(p_op_id uuid,p_code text,p_name_en text,p_name_ar text default null,
  p_starts_on date default null,p_event_type text default 'PROD') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rpc text; v_result jsonb; v_id uuid;
begin
  if not public.is_owner() then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_event_type is null or p_event_type not in ('PROD','TEST') then perform public.phase2_fail('INVALID_EVENT_TYPE'); end if;
  v_rpc:=public.phase5_operation_name('create_typed_event',p_op_id,p_op_id,jsonb_build_object('code',p_code,'name',p_name_en,'ar',p_name_ar,'date',p_starts_on,'type',p_event_type));
  v_result:=public.op_result(p_op_id,v_rpc); if v_result is not null then return v_result; end if;
  if p_code is null or p_code !~ '^[A-Z0-9][A-Z0-9_-]{1,29}$' or nullif(btrim(p_name_en),'') is null then perform public.phase2_fail('INVALID_EVENT'); end if;
  insert into public.events(code,name_en,name_ar,starts_on,event_type,created_by)
    values(p_code,btrim(p_name_en),nullif(btrim(p_name_ar),''),p_starts_on,p_event_type,public.current_member_id()) returning id into v_id;
  v_result:=jsonb_build_object('id',v_id,'event_type',p_event_type);
  perform public.audit(v_id,'EVENT_CREATED','event',v_id,null,v_result);
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

create function public.set_event_type(p_op_id uuid,p_event uuid,p_event_type text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rpc text; v_old jsonb; v_type text; v_status text; v_result jsonb;
begin
  if not public.is_owner() then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_event_type is null or p_event_type not in ('PROD','TEST') then perform public.phase2_fail('INVALID_EVENT_TYPE'); end if;
  v_rpc:=public.phase5_operation_name('set_event_type',p_event,p_event,jsonb_build_object('type',p_event_type));
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  select event_type,status into v_type,v_status from public.events where id=p_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if v_status<>'DRAFT' then perform public.phase2_fail('EVENT_TYPE_LOCKED'); end if;
  update public.events set event_type=p_event_type,updated_at=now() where id=p_event;
  v_result:=jsonb_build_object('id',p_event,'event_type',p_event_type);
  perform public.audit(p_event,'EVENT_TYPE_CHANGED','event',p_event,jsonb_build_object('event_type',v_type),v_result);
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

create function public.finish_event(p_op_id uuid,p_event uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rpc text; v_old jsonb; v_event public.events; v_blockers jsonb; v_result jsonb;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_rpc:=public.phase5_operation_name('finish_event',p_event,p_event,'{}'::jsonb);
  v_old:=public.op_result(p_op_id,v_rpc); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  select * into v_event from public.events where id=p_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  if v_event.status not in ('DRAFT','LIVE') then perform public.phase2_fail('EVENT_FINISHED'); end if;
  v_blockers:=public.event_completion_blockers(p_event);
  if v_blockers<>'{"round_ids":[],"match_ids":[]}'::jsonb then perform public.phase2_fail('EVENT_INCOMPLETE',v_blockers); end if;
  update public.events set status='FINISHED',registration_open=false,finished_at=now(),finished_by=public.current_member_id(),updated_at=now() where id=p_event;
  v_result:=public.phase4_event_json(p_event);
  perform public.audit(p_event,'EVENT_FINISHED','event',p_event,jsonb_build_object('status',v_event.status),v_result);
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  return public.op_complete(p_op_id,v_rpc,v_result);
end $$;

-- Keep completion true after finish. These guards also protect old/offline clients.
create function public.guard_finished_event_structure() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event uuid:=new.event_id;
begin
  perform public.phase2_event_lock(v_event);
  if exists(select 1 from public.events where id=v_event and status in ('FINISHED','ARCHIVED')) then
    if tg_table_name='rounds' and new.status<>'CLOSED' then perform public.phase2_fail('EVENT_FINISHED'); end if;
    if tg_table_name='matches' then
      if new.status='SCHEDULED' and not exists(select 1 from public.games where id=new.game_id and is_neutral) then perform public.phase2_fail('EVENT_FINISHED'); end if;
      if public.current_member_id() is not null and not public.is_event_admin(v_event) then perform public.phase2_fail('EVENT_FINISHED'); end if;
    end if;
  end if;
  return new;
end $$;
create trigger finished_round_guard before insert or update on public.rounds for each row execute function public.guard_finished_event_structure();
create trigger finished_match_guard before insert or update on public.matches for each row execute function public.guard_finished_event_structure();

create function public.guard_finished_neutral_game() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  perform public.phase2_event_lock(new.event_id);
  if old.is_neutral and not new.is_neutral and exists(select 1 from public.events where id=new.event_id and status in ('FINISHED','ARCHIVED'))
    and exists(select 1 from public.matches m where m.game_id=new.id and m.status<>'VOID' and (m.status<>'COMPLETED'
      or exists(select 1 from public.match_participants mp where mp.match_id=m.id and mp.outcome='PENDING'))) then perform public.phase2_fail('EVENT_FINISHED'); end if;
  return new;
end $$;
create trigger finished_neutral_guard before update of is_neutral on public.games for each row execute function public.guard_finished_neutral_game();

create function public.get_my_event_history() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_member uuid:=public.current_member_id(); begin
  if v_member is null then perform public.phase2_fail('UNAUTHORIZED'); end if;
  return jsonb_build_object(
    'history',coalesce((select jsonb_agg(public.phase4_event_json(e.id)||jsonb_build_object(
      'roles',(select jsonb_agg(jsonb_build_object('role',er.role,'team_code',t.code,'team_name',t.name_en,
        'game_codes',coalesce((select jsonb_agg(g.code order by g.code) from public.referee_games rg join public.games g on g.id=rg.game_id where rg.event_id=e.id and rg.member_id=v_member and er.role='REFEREE'),'[]'::jsonb)) order by er.role)
        from public.event_roles er left join public.teams t on t.id=er.team_id where er.event_id=e.id and er.member_id=v_member),
      'can_recap',public.is_event_admin(e.id)) order by e.starts_on desc nulls last,e.created_at desc,e.id)
      from public.events e where e.event_type='PROD' and e.status='FINISHED' and exists(select 1 from public.event_roles where event_id=e.id and member_id=v_member)),'[]'::jsonb),
    'managed',coalesce((select jsonb_agg(public.phase4_event_json(e.id) order by e.created_at desc,e.id) from public.events e where public.is_event_admin(e.id)),'[]'::jsonb));
end $$;

create function public.get_event_recap(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb; begin
  -- Existing export checks permission and provides the same statement snapshot.
  v_result:=public.get_export_data(p_event);
  return v_result||jsonb_build_object('blockers',public.event_completion_blockers(p_event),
    'settings',(select jsonb_build_object('registration_open',e.registration_open,'leaderboard_public',e.leaderboard_public,
      'match_bonus_cap',e.match_bonus_cap,'match_penalty_cap',e.match_penalty_cap,'event_bonus_cap',e.event_bonus_cap,'event_penalty_cap',e.event_penalty_cap,
      'created_at',e.created_at,'finished_by',m.full_name_en) from public.events e left join public.members m on m.id=e.finished_by where e.id=p_event),
    'matches',coalesce((select jsonb_agg(x.value||jsonb_build_object('void_reason',m.void_reason) order by x.ordinality)
      from jsonb_array_elements(v_result->'matches') with ordinality x(value,ordinality) join public.matches m on m.id=(x.value->>'id')::uuid),'[]'::jsonb),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',number,'type',type,'name_en',name_en,'status',status,
      'duration_min',duration_min,'extension_min',extension_min,'started_at',started_at,'closed_at',closed_at) order by number) from public.rounds where event_id=p_event),'[]'::jsonb),
    'teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_en',name_en) order by sort_order,code) from public.teams where event_id=p_event),'[]'::jsonb),
    'games',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_en',name_en,'location_en',location_en,'is_neutral',is_neutral) order by code) from public.games where event_id=p_event),'[]'::jsonb),
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'phone',r.phone,'team_code',t.code,'status',r.status,'created_at',r.created_at,
      'invite_id',r.invite_id,'invite_team_code',it.code,'invite_created_at',i.created_at,'invite_created_by',mb.full_name_en,
      'possible_duplicate',exists(select 1 from public.player_registrations other where other.event_id=p_event and other.id<>r.id and other.status='ACTIVE' and (lower(other.name)=lower(r.name) or (r.phone is not null and other.phone=r.phone))))
      order by t.sort_order,t.code,r.created_at,r.id) from public.player_registrations r join public.teams t on t.id=r.team_id
      left join public.team_invites i on i.id=r.invite_id left join public.teams it on it.id=i.team_id left join public.members mb on mb.id=i.created_by where r.event_id=p_event),'[]'::jsonb));
end $$;

revoke all on function public.event_completion_blockers(uuid),public.guard_finished_event_structure(),public.guard_finished_neutral_game() from public,anon,authenticated;
revoke all on function public.create_typed_event(uuid,text,text,text,date,text),public.set_event_type(uuid,uuid,text),public.finish_event(uuid,uuid),public.get_my_event_history(),public.get_event_recap(uuid) from public,anon,authenticated;
grant execute on function public.create_typed_event(uuid,text,text,text,date,text),public.set_event_type(uuid,uuid,text),public.finish_event(uuid,uuid),public.get_my_event_history(),public.get_event_recap(uuid) to authenticated,service_role;

-- Only non-personal event labels; safe for join and historical headers.
create function public.get_event_header(p_event uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',id,'name_en',name_en,'name_ar',name_ar,'event_type',event_type,'status',status)
  from public.events where id=p_event
$$;
revoke all on function public.get_event_header(uuid) from public;
grant execute on function public.get_event_header(uuid) to anon,authenticated,service_role;

create function public.guard_finished_registration() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$ begin
  if new.status in ('FINISHED','ARCHIVED') and new.registration_open then perform public.phase2_fail('EVENT_FINISHED'); end if;
  return new;
end $$;
revoke all on function public.guard_finished_registration() from public,anon,authenticated;
create trigger finished_registration_guard before update of registration_open on public.events for each row execute function public.guard_finished_registration();
