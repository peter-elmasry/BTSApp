-- D057: exact half-heart draws. Other gains and POINTS remain integer-configured.
alter table public.events drop constraint events_points_draw_check;
-- UPDATE OF dependencies prevent altering the column type; preserve the exact trigger.
drop trigger phase6_points_invalidate on public.events;
alter table public.events alter column points_draw type numeric using points_draw::numeric;
create trigger phase6_points_invalidate after update of points_win,points_draw,points_loss,scoring_mode,initial_lives on public.events
for each row execute function public.phase6_invalidate_ties();
create function public.half_heart_draw_rule()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.scoring_mode='LIVES' then new.points_draw:=-0.5; end if;
  return new;
end $$;
create trigger half_heart_draw_rule before insert or update on public.events
for each row execute function public.half_heart_draw_rule();
revoke execute on function public.half_heart_draw_rule() from public,anon,authenticated;
-- Recalculate old draws, invalidating existing tie positions through the scoring trigger.
update public.events set points_draw=-0.5 where scoring_mode='LIVES';
alter table public.events add constraint events_points_draw_check check (
  (scoring_mode='LIVES' and points_draw=-0.5) or
  (scoring_mode='POINTS' and points_draw between -999999 and 999999 and points_draw=trunc(points_draw))
);

create or replace function public.upsert_event_settings(p_op_id uuid, p_event uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_old jsonb; v_result jsonb; v_before jsonb; v_key text; v_event public.events;
  v_mode text; v_lives int;
  v_allowed text[] := array['leaderboard_public','show_guide_phone','points_win','points_draw','points_loss',
    'currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural',
    'match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap','name_en','name_ar',
    'scoring_mode','initial_lives','life_emoji'];
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_old := public.op_result(p_op_id,'upsert_event_settings'); if v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if p_settings is null or jsonb_typeof(p_settings)<>'object' or not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('INVALID_SETTINGS'); end if;
  for v_key in select jsonb_object_keys(p_settings) loop
    if not v_key=any(v_allowed) then perform public.phase2_fail('INVALID_SETTINGS', jsonb_build_object('field',v_key)); end if;
  end loop;
  if (p_settings ? 'leaderboard_public' and jsonb_typeof(p_settings->'leaderboard_public') is distinct from 'boolean')
     or (p_settings ? 'show_guide_phone' and jsonb_typeof(p_settings->'show_guide_phone') is distinct from 'boolean') then perform public.phase2_fail('INVALID_SETTINGS'); end if;
  if (p_settings ? 'name_en' and (jsonb_typeof(p_settings->'name_en') is distinct from 'string' or length(trim(p_settings->>'name_en')) not between 1 and 120))
     or (p_settings ? 'name_ar' and p_settings->'name_ar' <> 'null'::jsonb and (jsonb_typeof(p_settings->'name_ar') is distinct from 'string' or length(trim(p_settings->>'name_ar')) > 120)) then
    perform public.phase2_fail('INVALID_SETTINGS',jsonb_build_object('fields',jsonb_build_array('name_en','name_ar')));
  end if;
  select * into v_event from public.events where id=p_event;
  v_mode := coalesce(upper(trim(p_settings->>'scoring_mode')),v_event.scoring_mode);
  -- Older clients/imports may supply a whole draw gain. Normalise before validation.
  if v_mode='LIVES' and p_settings ? 'points_draw' and jsonb_typeof(p_settings->'points_draw')='number'
     and ((p_settings->>'points_draw') ~ '^-?[0-9]{1,6}$' or (p_settings->>'points_draw')::numeric=-0.5) then
    p_settings:=jsonb_set(p_settings,'{points_draw}','-0.5'::jsonb);
  end if;
  if exists(select 1 from unnest(array['points_win','points_draw','points_loss']) k where p_settings ? k and (jsonb_typeof(p_settings->k) is distinct from 'number' or (p_settings->>k !~ '^-?[0-9]{1,6}$' and not (k='points_draw' and v_mode='LIVES' and (p_settings->>k)::numeric=-0.5))))
     or exists(select 1 from unnest(array['match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap']) k where p_settings ? k and p_settings->k <> 'null'::jsonb and (jsonb_typeof(p_settings->k) is distinct from 'number' or p_settings->>k !~ '^[0-9]{1,6}$'))
     or exists(select 1 from unnest(array['currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural']) k where p_settings ? k and (jsonb_typeof(p_settings->k)<>'string' or length(trim(p_settings->>k)) not between 1 and 40)) then perform public.phase2_fail('INVALID_SETTINGS'); end if;
  if p_settings ? 'scoring_mode' and (jsonb_typeof(p_settings->'scoring_mode') is distinct from 'string' or upper(trim(p_settings->>'scoring_mode')) not in ('POINTS','LIVES')) then
    perform public.phase2_fail('INVALID_SETTINGS',jsonb_build_object('field','scoring_mode'));
  end if;
  if p_settings ? 'initial_lives' and p_settings->'initial_lives' <> 'null'::jsonb and (jsonb_typeof(p_settings->'initial_lives') is distinct from 'number'
       or p_settings->>'initial_lives' !~ '^[0-9]{1,4}$' or (p_settings->>'initial_lives')::int not between 1 and 9999) then
    perform public.phase2_fail('INVALID_SETTINGS',jsonb_build_object('field','initial_lives'));
  end if;
  if p_settings ? 'life_emoji' and (jsonb_typeof(p_settings->'life_emoji') is distinct from 'string' or char_length(btrim(p_settings->>'life_emoji')) not between 1 and 16) then
    perform public.phase2_fail('INVALID_SETTINGS',jsonb_build_object('field','life_emoji'));
  end if;
  select * into v_event from public.events where id=p_event;
  v_mode := case when p_settings ? 'scoring_mode' then upper(trim(p_settings->>'scoring_mode')) else v_event.scoring_mode end;
  v_lives := case when p_settings ? 'initial_lives' then (p_settings->>'initial_lives')::int else v_event.initial_lives end;
  if v_mode='LIVES' and v_lives is null then
    perform public.phase2_fail('INVALID_SETTINGS',jsonb_build_object('field','initial_lives'));
  end if;
  -- Scoring rules are fixed once play has begun (a round has ever started).
  if (v_mode is distinct from v_event.scoring_mode or (v_mode='LIVES' and v_lives is distinct from v_event.initial_lives))
     and exists(select 1 from public.rounds where event_id=p_event and started_at is not null) then
    perform public.phase2_fail('SCORING_LOCKED',jsonb_build_object('field','scoring_mode'));
  end if;
  select to_jsonb(e) into v_before from public.events e where e.id=p_event;
  update public.events set
    name_en = case when p_settings ? 'name_en' then trim(p_settings->>'name_en') else name_en end,
    name_ar = case when p_settings ? 'name_ar' then nullif(trim(p_settings->>'name_ar'),'') else name_ar end,
    leaderboard_public = case when p_settings ? 'leaderboard_public' then (p_settings->>'leaderboard_public')::boolean else leaderboard_public end,
    show_guide_phone = case when p_settings ? 'show_guide_phone' then (p_settings->>'show_guide_phone')::boolean else show_guide_phone end,
    points_win = case when p_settings ? 'points_win' then (p_settings->>'points_win')::int
      when v_mode='LIVES' and v_event.scoring_mode<>'LIVES' then 0 else points_win end,
    points_draw = case when v_mode='LIVES' then -0.5
      when p_settings ? 'points_draw' then (p_settings->>'points_draw')::numeric
      when v_event.scoring_mode='LIVES' then 1 else points_draw end,
    points_loss = case when p_settings ? 'points_loss' then (p_settings->>'points_loss')::int
      when v_mode='LIVES' and v_event.scoring_mode<>'LIVES' then -1 else points_loss end,
    currency_en_one = case when p_settings ? 'currency_en_one' then p_settings->>'currency_en_one' else currency_en_one end,
    currency_en_other = case when p_settings ? 'currency_en_other' then p_settings->>'currency_en_other' else currency_en_other end,
    currency_ar_one = case when p_settings ? 'currency_ar_one' then p_settings->>'currency_ar_one' else currency_ar_one end,
    currency_ar_two = case when p_settings ? 'currency_ar_two' then p_settings->>'currency_ar_two' else currency_ar_two end,
    currency_ar_plural = case when p_settings ? 'currency_ar_plural' then p_settings->>'currency_ar_plural' else currency_ar_plural end,
    match_bonus_cap = case when p_settings ? 'match_bonus_cap' then (p_settings->>'match_bonus_cap')::int else match_bonus_cap end,
    match_penalty_cap = case when p_settings ? 'match_penalty_cap' then (p_settings->>'match_penalty_cap')::int else match_penalty_cap end,
    event_bonus_cap = case when p_settings ? 'event_bonus_cap' then (p_settings->>'event_bonus_cap')::int else event_bonus_cap end,
    event_penalty_cap = case when p_settings ? 'event_penalty_cap' then (p_settings->>'event_penalty_cap')::int else event_penalty_cap end,
    scoring_mode = v_mode,
    initial_lives = v_lives,
    life_emoji = case when p_settings ? 'life_emoji' then btrim(p_settings->>'life_emoji') else life_emoji end,
    updated_at=now() where id=p_event;
  select jsonb_build_object('event_id',e.id,'settings',jsonb_build_object('name_en',e.name_en,'name_ar',e.name_ar,'leaderboard_public',e.leaderboard_public,'show_guide_phone',e.show_guide_phone,
    'points_win',e.points_win,'points_draw',e.points_draw,'points_loss',e.points_loss,'currency_en_one',e.currency_en_one,'currency_en_other',e.currency_en_other,
    'currency_ar_one',e.currency_ar_one,'currency_ar_two',e.currency_ar_two,'currency_ar_plural',e.currency_ar_plural,'match_bonus_cap',e.match_bonus_cap,
    'match_penalty_cap',e.match_penalty_cap,'event_bonus_cap',e.event_bonus_cap,'event_penalty_cap',e.event_penalty_cap,
    'scoring_mode',e.scoring_mode,'initial_lives',e.initial_lives,'life_emoji',e.life_emoji)) into v_result from public.events e where e.id=p_event;
  perform public.audit(p_event,'EVENT_SETTINGS_UPDATED','event',p_event,v_before,v_result);
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'upsert_event_settings',v_result);
end $$;

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
      coalesce((select sum(a.points::bigint) from public.adjustments a
        left join public.matches am on am.id=a.match_id and am.event_id=p_event
        where a.event_id=p_event and a.team_id=t.id and a.revoked_at is null
          and (a.scope='EVENT' or am.status<>'VOID')),0)::bigint as adjustment_points
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

create or replace function public.phase3_check_record(p_sheet text, p_record jsonb)
returns void language plpgsql immutable set search_path = public, pg_temp
as $$
declare v_allowed text[]; v_required text[]; v_key text; v_type text;
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    perform public.phase2_fail('INVALID_ROW',jsonb_build_object('field',''));
  end if;
  case p_sheet
    when 'Event' then
      v_allowed:=array['name_en','name_ar','points_win','points_draw','points_loss','currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural','match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap','leaderboard_public','scoring_mode','initial_lives','life_emoji'];
      v_required:=array['name_en','points_win','points_draw','points_loss','currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural'];
    when 'Teams' then
      v_allowed:=array['code','name_en','name_ar','avatar_key','color_hex'];
      v_required:=array['code','name_en','avatar_key','color_hex'];
    when 'Games' then
      v_allowed:=array['code','name_en','name_ar','location_en','location_ar'];
      v_required:=array['code','name_en'];
    when 'Rounds' then
      v_allowed:=array['number','type','name_en','name_ar','duration_min'];
      v_required:=array['number','type','duration_min'];
    when 'Matches' then
      v_allowed:=array['round_number','game_code','team_a_code','team_b_code'];
      v_required:=array['round_number','game_code'];
    when 'Staff' then
      v_allowed:=array['member','role','game_codes','team_code'];
      v_required:=array['member','role'];
    else perform public.phase2_fail('INVALID_PAYLOAD');
  end case;
  foreach v_key in array v_required loop
    if not p_record ? v_key or p_record->v_key='null'::jsonb or trim(p_record->>v_key)='' then
      perform public.phase2_fail('REQUIRED_FIELD',jsonb_build_object('field',v_key));
    end if;
  end loop;
  for v_key,v_type in select key,jsonb_typeof(value) from jsonb_each(p_record) loop
    if v_key='row' then
      if v_type<>'number' or p_record->>v_key !~ '^[1-9][0-9]{0,6}$' then
        perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
      end if;
    elsif not v_key=any(v_allowed) then
      perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
    elsif v_type='null' and not v_key=any(v_required) then
      null;
    elsif v_key in ('number','duration_min','round_number','points_win','points_draw','points_loss','match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap','initial_lives') then
      if v_type<>'number' or (p_record->>v_key !~ (case when v_key in ('points_win','points_draw','points_loss') then '^-?[0-9]{1,6}$' else '^[0-9]{1,6}$' end)
         -- Blank mode preserves the target event; its settings RPC enforces POINTS/LIVES.
         and not coalesce(v_key='points_draw' and coalesce(upper(p_record->>'scoring_mode'),'LIVES')='LIVES' and (p_record->>v_key)::numeric=-0.5,false)) then
        perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
      end if;
    elsif v_key='leaderboard_public' then
      if v_type<>'boolean' then perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key)); end if;
    elsif v_type<>'string' then
      perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
    end if;
    if v_type='string' and (
        (v_key in ('code','game_code') and upper(trim(p_record->>v_key)) !~ case when p_sheet='Teams' then '^T[0-9]{1,3}$' else '^G[0-9]{1,3}$' end)
        or (v_key='color_hex' and p_record->>v_key !~ '^#[0-9A-Fa-f]{6}$')
        or (v_key='avatar_key' and p_record->>v_key not in ('falcon','lion','fox','owl','eagle','turtle','dolphin','whale','butterfly','horse','star','shield','bolt','mountain','sun','moon','flame','wave','anchor','crown','ball','racket','trophy','compass'))
        or (v_key in ('name_en','name_ar') and length(trim(p_record->>v_key)) > case when p_sheet='Teams' then 80 when p_sheet in ('Games','Rounds') then 100 else 120 end)
        or (v_key in ('location_en','location_ar') and length(p_record->>v_key)>120)
        or (v_key like 'currency_%' and length(trim(p_record->>v_key)) not between 1 and 40)
        or (v_key='type' and upper(trim(p_record->>v_key)) not in ('REGULAR','OPENING'))
        or (v_key='scoring_mode' and upper(trim(p_record->>v_key)) not in ('POINTS','LIVES'))
        or (v_key='life_emoji' and char_length(btrim(p_record->>v_key)) not between 1 and 16)
      ) then
      perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
    end if;
    if v_key='initial_lives' and v_type='number' and (p_record->>v_key)::int not between 1 and 9999 then
      perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
    end if;
    if v_key='duration_min' and (p_record->>v_key)::int not between 1 and 600 then
      perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
    end if;
  end loop;
end $$;

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
    'adjustment_points',(select (x->>'adjustment_points')::bigint from standing_row),
    'total',(select (x->>'total')::numeric from standing_row),
    'lives_change',case when e.scoring_mode='LIVES' then (select (x->>'match_points')::numeric from standing_row)-e.initial_lives else null end,
    'match_values',coalesce((select jsonb_object_agg(id::text,value) from per_match),'{}'::jsonb))
  from e
$$;

revoke execute on function public.phase6_standings(uuid),public.ux_team_breakdown(uuid,uuid),public.phase3_check_record(text,jsonb) from public,anon,authenticated;

create or replace function public.set_tiebreak(p_op_id uuid,p_event uuid,p_team_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_rpc text; v_old jsonb; v_rows jsonb; v_before jsonb; v_result jsonb;
  v_total numeric; v_group uuid[]; v_supplied uuid[]; begin
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
  select (x->>'total')::numeric into v_total from jsonb_array_elements(v_rows) x where x->'team'->>'id'=p_team_ids[array_lower(p_team_ids,1)]::text;
  if v_total is null then perform public.phase2_fail('INVALID_TIEBREAK'); end if;
  select array_agg((x->'team'->>'id')::uuid order by x->'team'->>'id') into v_group
    from jsonb_array_elements(v_rows) x where (x->>'total')::numeric=v_total;
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
