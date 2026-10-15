-- D061: fresh committed cues, explicit device activation and no public result broadcast.
alter table public.events add column audio_config jsonb not null default
'{"enabled":true,"round_start":true,"round_end":true,"match_win":true,"match_loss":true,"match_draw":true}'::jsonb;
create or replace function public.valid_audio_config(p_config jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp
as $$ begin
  if p_config is null or jsonb_typeof(p_config)<>'object' then return false; end if;
  return (select count(*)=6 and bool_and(key=any(array['enabled','round_start','round_end','match_win','match_loss','match_draw']) and jsonb_typeof(value)='boolean') from jsonb_each(p_config));
end $$;
alter table public.events add constraint events_audio_config_valid check(public.valid_audio_config(audio_config));
revoke execute on function public.valid_audio_config(jsonb) from public,anon,authenticated;

create or replace function public.set_audio_config(p_op_id uuid,p_event uuid,p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_old jsonb; v_before jsonb; begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_old:=public.op_result(p_op_id,'set_audio_config:'||p_event::text); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if not public.valid_audio_config(p_config) then perform public.phase2_fail('INVALID_AUDIO_CONFIG'); end if;
  select audio_config into v_before from public.events where id=p_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  update public.events set audio_config=p_config where id=p_event;
  perform public.audit(p_event,'AUDIO_CONFIG_UPDATED','event',p_event,v_before,p_config);
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'set_audio_config:'||p_event::text,p_config);
end $$;
revoke execute on function public.set_audio_config(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_audio_config(uuid,uuid,jsonb) to authenticated,service_role;

create table public.round_audio_cues (
  sequence bigint generated always as identity primary key,
  cue_id uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  cue text not null check(cue in ('round-start','round-end')),
  occurred_at timestamptz not null default clock_timestamp()
);
create index round_audio_recent on public.round_audio_cues(event_id,occurred_at);
alter table public.round_audio_cues enable row level security;
revoke all on public.round_audio_cues from anon,authenticated;
revoke all on sequence public.round_audio_cues_sequence_seq from anon,authenticated;

create or replace function public.record_round_audio()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_cue text; v_config jsonb; v_row public.round_audio_cues; begin
  v_cue:=case when old.status='DRAFT' and new.status='ACTIVE' then 'round-start'
    when old.status='ACTIVE' and new.status='CLOSED' then 'round-end' else null end;
  if v_cue is null then return new; end if;
  select audio_config into v_config from public.events where id=new.event_id;
  if not (v_config->>'enabled')::boolean or not (v_config->>replace(v_cue,'-','_'))::boolean then return new; end if;
  insert into public.round_audio_cues(event_id,round_id,cue) values(new.event_id,new.id,v_cue) returning * into v_row;
  delete from public.round_audio_cues where event_id=new.event_id and occurred_at<clock_timestamp()-interval '1 day';
  begin
    perform realtime.send(jsonb_build_object('type','round_audio','roundId',new.id,'cueId',v_row.cue_id,
      'cue',v_cue,'occurredAt',v_row.occurred_at),'round_audio','event:'||new.event_id::text,false);
  exception when others then
    -- Polling can recover a fresh occurrence; an unavailable audio transport must not fail the round.
    raise warning 'ROUND_AUDIO_BROADCAST_FAILED';
  end;
  return new;
end $$;
revoke execute on function public.record_round_audio() from public,anon,authenticated;
create trigger round_audio_committed after update of status on public.rounds
for each row when(old.status is distinct from new.status) execute function public.record_round_audio();

create or replace function public.get_recent_round_cues(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare v_config jsonb; begin
  select audio_config into v_config from public.events where id=p_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  return jsonb_build_object('serverNow',clock_timestamp(),'config',v_config,'cues',coalesce((
    select jsonb_agg(jsonb_build_object('cueId',cue_id,'roundId',round_id,'cue',cue,'occurredAt',occurred_at) order by sequence)
    from public.round_audio_cues where event_id=p_event and occurred_at between clock_timestamp()-interval '10 seconds' and clock_timestamp()
      and (v_config->>'enabled')::boolean and (v_config->>replace(cue,'-','_'))::boolean
  ),'[]'::jsonb));
end $$;

-- Transaction-start result timestamps may be old after waiting for a lock.
-- Keep an action-time occurrence timestamp without changing the existing audit field.
alter table public.matches add column audio_result_at timestamptz, add column audio_config_at_result jsonb;
create or replace function public.stamp_audio_result()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  new.audio_result_at:=case when new.status='COMPLETED' then clock_timestamp() else null end;
  new.audio_config_at_result:=case when new.status='COMPLETED' then (select audio_config from public.events where id=new.event_id) else null end;
  return new;
end $$;
revoke execute on function public.stamp_audio_result() from public,anon,authenticated;
create trigger audio_result_occurrence before update of status,result_entered_at on public.matches
for each row execute function public.stamp_audio_result();

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
      join public.matches m on m.id=(x->>'id')::uuid and m.event_id=p_event
      cross join lateral jsonb_array_elements(x->'participants') participant
    where participant->>'team_id'=v_team::text
  ),'[]'::jsonb));
end $$;
revoke execute on function public.get_recent_round_cues(uuid),public.get_team_audio_results(uuid,text) from public,anon,authenticated;
grant execute on function public.get_recent_round_cues(uuid),public.get_team_audio_results(uuid,text) to anon,authenticated,service_role;

create or replace function public.phase4_event_json(p_event uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'id',e.id,'code',e.code,'name_en',e.name_en,'name_ar',e.name_ar,'status',e.status,
    'starts_on',e.starts_on,'leaderboard_public',e.leaderboard_public,'show_guide_phone',e.show_guide_phone,
    'points_win',e.points_win,'points_draw',e.points_draw,'points_loss',e.points_loss,
    'currency_en_one',e.currency_en_one,'currency_en_other',e.currency_en_other,
    'currency_ar_one',e.currency_ar_one,'currency_ar_two',e.currency_ar_two,'currency_ar_plural',e.currency_ar_plural,
    'scoring_mode',e.scoring_mode,'initial_lives',e.initial_lives,'life_emoji',e.life_emoji,'audio_config',e.audio_config
  ) from public.events e where e.id=p_event
$$;
