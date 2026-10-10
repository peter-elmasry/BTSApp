-- Phase 3: workbook import. Reuse setup RPCs inside a rollbackable transaction
-- so preview validates the exact write path without retaining writes or signals.
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
      v_allowed:=array['name_en','name_ar','points_win','points_draw','points_loss','currency_en_one','currency_en_other','currency_ar_one','currency_ar_two','currency_ar_plural','match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap','leaderboard_public'];
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
    elsif v_key in ('number','duration_min','round_number','points_win','points_draw','points_loss','match_bonus_cap','match_penalty_cap','event_bonus_cap','event_penalty_cap') then
      if v_type<>'number' or p_record->>v_key !~ '^[0-9]{1,6}$' then
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
      ) then
      perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
    end if;
    if v_key='duration_min' and (p_record->>v_key)::int not between 1 and 600 then
      perform public.phase2_fail('INVALID_FIELD',jsonb_build_object('field',v_key));
    end if;
  end loop;
end $$;

create or replace function public.import_event_setup(
  p_op_id uuid, p_event uuid, p_payload jsonb, p_mode text default 'UPSERT', p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_rpc text:='import_event_setup:'||p_event::text;
  v_old jsonb; v_errors jsonb:='[]'; v_counts jsonb:='{}'; v_report jsonb;
  v_sheet text; v_array text; v_record jsonb; v_clean jsonb; v_entry record;
  v_row int; v_column text; v_code text; v_detail text; v_key text; v_seen text[];
  v_id uuid; v_round uuid; v_game uuid; v_team uuid; v_member uuid; v_round_type text;
  v_games uuid[]; v_game_code text; v_phone text;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  -- Event is part of replay identity: even owners cannot replay another event's import.
  v_old:=public.op_result(p_op_id,v_rpc);
  if not p_dry_run and v_old is not null then return v_old; end if;
  perform public.phase2_event_lock(p_event);
  if p_dry_run is null or p_mode is null or p_mode not in ('UPSERT','REPLACE') then
    return jsonb_build_object('valid',false,'errors',jsonb_build_array(jsonb_build_object('sheet','Workbook','row',0,'column','mode','code','INVALID_MODE')),'counts',jsonb_build_object('teams',0,'games',0,'rounds',0,'matches',0,'staff',0),'applied',false);
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    v_errors:=jsonb_build_array(jsonb_build_object('sheet','Workbook','row',0,'column','','code','INVALID_PAYLOAD'));
  else
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('event','teams','games','rounds','matches','staff'))
       or jsonb_typeof(p_payload->'event') is distinct from 'object' then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('sheet','Event','row',0,'column','','code','INVALID_PAYLOAD'));
    end if;
  end if;
  foreach v_array in array array['teams','games','rounds','matches','staff'] loop
    if jsonb_typeof(p_payload->v_array) is distinct from 'array' then
      v_counts:=v_counts||jsonb_build_object(v_array,0);
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('sheet',initcap(v_array),'row',0,'column','','code','INVALID_PAYLOAD'));
    else v_counts:=v_counts||jsonb_build_object(v_array,jsonb_array_length(p_payload->v_array)); end if;
  end loop;
  if v_errors<>'[]'::jsonb then
    return jsonb_build_object('valid',false,'errors',v_errors,'counts',v_counts,'applied',false);
  end if;
  if p_mode='REPLACE' and ((select status from public.events where id=p_event)<>'DRAFT'
      or exists(select 1 from public.rounds where event_id=p_event and (started_at is not null or status<>'DRAFT'))) then
    return jsonb_build_object('valid',false,'errors',jsonb_build_array(jsonb_build_object('sheet','Workbook','row',0,'column','mode','code','REPLACE_NOT_ALLOWED')),'counts',v_counts,'applied',false);
  end if;

  -- Each row has its own error boundary; the outer boundary discards every
  -- successful row as well when any row failed, or when this is only preview.
  begin
    if p_mode='REPLACE' then
      delete from public.referee_games where event_id=p_event;
      delete from public.event_roles where event_id=p_event and role<>'EVENT_ADMIN';
      delete from public.adjustments where event_id=p_event;
      delete from public.rounds where event_id=p_event;
      delete from public.games where event_id=p_event;
      delete from public.teams where event_id=p_event;
    end if;
    v_sheet:='Event'; v_row:=0; v_column:='';
    begin
      perform public.phase3_check_record(v_sheet,p_payload->'event');
      v_clean:=p_payload->'event';
      -- A blank optional workbook boolean means keep the current setting.
      if v_clean->'leaderboard_public'='null'::jsonb then v_clean:=v_clean-'leaderboard_public'; end if;
      perform public.upsert_event_settings(gen_random_uuid(),p_event,v_clean);
    exception when sqlstate 'P0001' or integrity_constraint_violation or data_exception then
      get stacked diagnostics v_code=message_text,v_detail=pg_exception_detail;
      v_column:=case when v_detail like '{%' then coalesce(v_detail::jsonb->>'field','') else '' end;
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('sheet',v_sheet,'row',v_row,'column',v_column,'code',v_code));
    end;

    foreach v_array in array array['teams','games','rounds','matches','staff'] loop
      v_sheet:=initcap(v_array); v_seen:=array[]::text[];
      for v_entry in select value,ordinality from jsonb_array_elements(p_payload->v_array) with ordinality loop
        v_record:=v_entry.value; v_row:=v_entry.ordinality+1; v_column:='';
        if v_record->>'row' ~ '^[1-9][0-9]{0,6}$' then v_row:=(v_record->>'row')::int; end if;
        begin
          perform public.phase3_check_record(v_sheet,v_record);
          v_clean:=v_record-'row'; v_id:=null;
          if v_array in ('teams','games') then
            v_column:='code'; v_key:=upper(trim(v_record->>'code'));
            if v_key=any(v_seen) then perform public.phase2_fail('DUPLICATE_CODE'); end if;
            v_seen:=array_append(v_seen,v_key);
            if v_array='teams' then
              select id into v_id from public.teams where event_id=p_event and code=v_key;
              if v_id is not null then v_clean:=v_clean||jsonb_build_object('sort_order',(select sort_order from public.teams where id=v_id)); end if;
              perform public.upsert_team(gen_random_uuid(),p_event,v_clean||jsonb_build_object('id',v_id));
            else
              select id into v_id from public.games where event_id=p_event and code=v_key;
              -- Images are UI-managed and survive workbook UPSERT.
              if v_id is not null then v_clean:=v_clean||jsonb_build_object('image_path',(select image_path from public.games where id=v_id)); end if;
              perform public.upsert_game(gen_random_uuid(),p_event,v_clean||jsonb_build_object('id',v_id));
            end if;
          elsif v_array='rounds' then
            v_column:='number'; v_key:=v_record->>'number';
            if v_key=any(v_seen) then perform public.phase2_fail('DUPLICATE_CODE'); end if;
            v_seen:=array_append(v_seen,v_key);
            select id into v_id from public.rounds where event_id=p_event and number=v_key::int;
            v_clean:=v_clean||jsonb_build_object('type',upper(trim(v_record->>'type')));
            perform public.upsert_round(gen_random_uuid(),p_event,v_clean||jsonb_build_object('id',v_id));
          elsif v_array='matches' then
            v_column:='round_number';
            select id,type into v_round,v_round_type from public.rounds where event_id=p_event and number=(v_record->>'round_number')::int;
            if v_round is null then perform public.phase2_fail('UNKNOWN_REFERENCE'); end if;
            v_column:='game_code';
            select id into v_game from public.games where event_id=p_event and code=upper(trim(v_record->>'game_code'));
            if v_game is null then perform public.phase2_fail('UNKNOWN_REFERENCE'); end if;
            v_key:=v_round::text||':'||v_game::text;
            if v_key=any(v_seen) then perform public.phase2_fail('DUPLICATE_MATCH'); end if;
            v_seen:=array_append(v_seen,v_key);
            v_column:='team_a_code';
            if v_round_type='OPENING' then
              if nullif(trim(v_record->>'team_a_code'),'') is not null or nullif(trim(v_record->>'team_b_code'),'') is not null then perform public.phase2_fail('INVALID_PARTICIPANTS'); end if;
              perform public.generate_opening_match(gen_random_uuid(),v_round,v_game);
            else
              if not exists(select 1 from public.teams where event_id=p_event and code=upper(trim(v_record->>'team_a_code'))) then perform public.phase2_fail('UNKNOWN_REFERENCE'); end if;
              v_column:='team_b_code';
              if not exists(select 1 from public.teams where event_id=p_event and code=upper(trim(v_record->>'team_b_code'))) then perform public.phase2_fail('UNKNOWN_REFERENCE'); end if;
              perform public.upsert_match(gen_random_uuid(),v_round,v_game,array[upper(trim(v_record->>'team_a_code')),upper(trim(v_record->>'team_b_code'))]);
            end if;
          else
            v_column:='member'; v_phone:=regexp_replace(trim(v_record->>'member'),'[\s()\-]','','g');
            if v_phone ~ '^01[0-9]{9}$' then v_phone:='+2'||v_phone;
            elsif v_phone ~ '^00201[0-9]{9}$' then v_phone:='+'||substring(v_phone from 3); end if;
            select id into v_member from public.members where is_active and
              case when v_phone ~ '^\+[0-9]{8,15}$' then phone=v_phone else username=trim(v_record->>'member')::citext end;
            if v_member is null then perform public.phase2_fail('MEMBER_NOT_ELIGIBLE'); end if;
            v_column:='role'; v_key:=v_member::text||':'||upper(trim(v_record->>'role'));
            if v_key=any(v_seen) then perform public.phase2_fail('DUPLICATE_STAFF'); end if;
            v_seen:=array_append(v_seen,v_key);
            if upper(trim(v_record->>'role'))='GUIDE' then
              v_column:='game_codes';
              if nullif(trim(v_record->>'game_codes'),'') is not null then perform public.phase2_fail('INVALID_ROLE'); end if;
              v_column:='team_code';
              select id into v_team from public.teams where event_id=p_event and code=upper(trim(v_record->>'team_code'));
              if v_team is null then perform public.phase2_fail('UNKNOWN_REFERENCE'); end if;
              perform public.set_event_role(gen_random_uuid(),p_event,v_member,'GUIDE',v_team);
            elsif upper(trim(v_record->>'role'))='REFEREE' then
              v_column:='team_code';
              if nullif(trim(v_record->>'team_code'),'') is not null then perform public.phase2_fail('INVALID_ROLE'); end if;
              v_column:='game_codes';
              if nullif(trim(v_record->>'game_codes'),'') is null then perform public.phase2_fail('REQUIRED_FIELD'); end if;
              v_games:=array[]::uuid[];
              for v_game_code in select upper(trim(x)) from unnest(string_to_array(v_record->>'game_codes',',')) x loop
                select id into v_game from public.games where event_id=p_event and code=v_game_code;
                if v_game is null then perform public.phase2_fail('UNKNOWN_REFERENCE'); end if;
                if v_game=any(v_games) then perform public.phase2_fail('INVALID_GAMES'); end if;
                v_games:=array_append(v_games,v_game);
              end loop;
              if p_mode='UPSERT' then
                select array_agg(distinct x) into v_games from (
                  select unnest(v_games) x union select game_id from public.referee_games where event_id=p_event and member_id=v_member
                ) retained;
              end if;
              perform public.set_event_role(gen_random_uuid(),p_event,v_member,'REFEREE');
              perform public.set_referee_games(gen_random_uuid(),p_event,v_member,v_games);
            else v_column:='role'; perform public.phase2_fail('INVALID_ROLE'); end if;
          end if;
        exception when sqlstate 'P0001' or integrity_constraint_violation or data_exception then
          get stacked diagnostics v_code=message_text,v_detail=pg_exception_detail;
          if v_detail like '{%' then v_column:=coalesce(v_detail::jsonb->>'field',v_column); end if;
          v_errors:=v_errors||jsonb_build_array(jsonb_build_object('sheet',v_sheet,'row',v_row,'column',v_column,'code',v_code));
        end;
      end loop;
    end loop;
    if exists(select 1 from public.rounds r where r.event_id=p_event and r.type='OPENING' and not exists(select 1 from public.matches m where m.round_id=r.id)) then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('sheet','Matches','row',0,'column','round_number','code','OPENING_MATCH_REQUIRED'));
    end if;
    if p_dry_run or v_errors<>'[]'::jsonb then raise exception using errcode='P0002',message='IMPORT_ROLLBACK'; end if;
    perform public.audit(p_event,'EVENT_SETUP_IMPORTED','event',p_event,null,jsonb_build_object('mode',p_mode,'counts',v_counts));
    perform public.emit(p_event,'roster_changed','{}');
    perform public.emit(p_event,'round_changed','{}');
  exception when sqlstate 'P0002' then
    if sqlerrm<>'IMPORT_ROLLBACK' then raise; end if;
  end;
  v_report:=jsonb_build_object('valid',v_errors='[]'::jsonb,'errors',v_errors,'counts',v_counts,'applied',not p_dry_run and v_errors='[]'::jsonb);
  if not p_dry_run and v_errors='[]'::jsonb then return public.op_complete(p_op_id,v_rpc,v_report); end if;
  return v_report;
end $$;

revoke execute on function public.phase3_check_record(text,jsonb),public.import_event_setup(uuid,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.import_event_setup(uuid,uuid,jsonb,text,boolean) to authenticated,service_role;
