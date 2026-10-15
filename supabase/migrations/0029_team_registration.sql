-- D064: account-free team registration; device secrets never leave private RPCs.
create extension if not exists pgcrypto with schema extensions;
alter table public.events add column registration_open boolean not null default true;

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
  enabled boolean not null default true,
  expires_at timestamptz not null default (now()+interval '30 days'),
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);
create unique index one_enabled_team_invite on public.team_invites(team_id) where enabled;

create table public.player_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  invite_id uuid references public.team_invites(id) on delete set null,
  device_hash text not null,
  name text not null check(char_length(name) between 1 and 100 and name=btrim(name)),
  phone text check(phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','REMOVED')),
  version integer not null default 1,
  removed_batch uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,device_hash)
);
create index player_registrations_team on public.player_registrations(event_id,team_id);
create index player_registrations_invite on public.player_registrations(invite_id);
create table public.registration_join_ops (
  op_id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  device_hash text not null,
  registration_id uuid not null references public.player_registrations(id) on delete cascade
);
alter table public.team_invites enable row level security;
alter table public.player_registrations enable row level security;
alter table public.registration_join_ops enable row level security;
revoke all on public.team_invites,public.player_registrations,public.registration_join_ops from anon,authenticated;
grant all on public.team_invites,public.player_registrations,public.registration_join_ops to service_role;

create function public.can_manage_team_players(p_event uuid,p_team uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.teams where id=p_team and event_id=p_event)
    and (public.is_event_admin(p_event) or exists(select 1 from public.event_roles
      where event_id=p_event and team_id=p_team and role='GUIDE' and member_id=public.current_member_id()))
$$;

create function public.registration_device_hash(p_secret text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then perform public.phase2_fail('INVALID_RECEIPT'); end if;
  return encode(extensions.digest(p_secret,'sha256'),'hex');
end $$;

create function public.registration_receipt(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',r.id,'event_id',r.event_id,'team_id',r.team_id,
    'team_code',t.code,'status',r.status,'version',r.version)
  from public.player_registrations r join public.teams t on t.id=r.team_id where r.id=p_id
$$;

create function public.get_player_registration(p_event uuid,p_secret text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select public.registration_receipt(id) from public.player_registrations
  where event_id=p_event and device_hash=public.registration_device_hash(p_secret) and auth.uid() is null
$$;

create function public.get_team_invite(p_event uuid,p_token text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  select jsonb_build_object('event_id',e.id,'event_name',e.name_en,'event_name_ar',e.name_ar,
    'team',jsonb_build_object('id',t.id,'code',t.code,'name_en',t.name_en,'name_ar',t.name_ar,
      'avatar_key',t.avatar_key,'image_path',t.image_path,'color_hex',t.color_hex),
    'guides',coalesce((select jsonb_agg(jsonb_build_object('name_en',m.full_name_en,'name_ar',m.full_name_ar)
      order by m.full_name_en) from public.event_roles er join public.members m on m.id=er.member_id
      where er.event_id=e.id and er.team_id=t.id and er.role='GUIDE' and m.is_active),'[]'::jsonb))
  into v_result from public.team_invites i join public.teams t on t.id=i.team_id and t.event_id=i.event_id
    join public.events e on e.id=i.event_id
  where i.event_id=p_event and i.token=p_token and i.enabled and i.expires_at>now()
    and e.registration_open and e.is_current and e.status in ('DRAFT','LIVE');
  if v_result is null then perform public.phase2_fail('INVITE_UNAVAILABLE'); end if;
  return v_result;
end $$;

create function public.join_team_invite(p_op_id uuid,p_event uuid,p_token text,p_secret text,p_name text,p_phone text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_hash text; v_registration public.player_registrations; v_invite public.team_invites;
  v_op public.registration_join_ops; v_name text; v_phone text;
begin
  if auth.uid() is not null then perform public.phase2_fail('STAFF_USE_ASSIGNED_TEAM'); end if;
  if p_op_id is null then perform public.phase2_fail('INVALID_OP_ID'); end if;
  v_hash:=public.registration_device_hash(p_secret);
  -- Event lock also serializes link revocation, pause, transfer and duplicate joins.
  perform pg_advisory_xact_lock(hashtextextended(p_op_id::text,0));
  perform public.phase2_event_lock(p_event);
  select * into v_op from public.registration_join_ops where op_id=p_op_id;
  if found and (v_op.event_id<>p_event or v_op.device_hash<>v_hash) then perform public.phase2_fail('OP_ID_CONFLICT'); end if;
  select * into v_registration from public.player_registrations where event_id=p_event and device_hash=v_hash;
  if found then
    -- Always return current state; a retry cannot undo a staff removal or transfer.
    return public.registration_receipt(v_registration.id);
  end if;
  perform public.get_team_invite(p_event,p_token);
  select * into v_invite from public.team_invites where event_id=p_event and token=p_token;
  v_name:=btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g'));
  v_phone:=nullif(public.normalize_member_phone(p_phone),'');
  if char_length(v_name) not between 1 and 100 then perform public.phase2_fail('INVALID_PLAYER_NAME'); end if;
  if nullif(btrim(p_phone),'') is not null and (v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$') then
    perform public.phase2_fail('INVALID_PHONE'); end if;
  -- Per-link burst limit; deliberately modest friction, not verified identity.
  if (select count(*) from public.player_registrations where invite_id=v_invite.id and created_at>now()-interval '1 minute')>=30 then
    perform public.phase2_fail('REGISTRATION_RATE_LIMIT'); end if;
  insert into public.player_registrations(event_id,team_id,invite_id,device_hash,name,phone)
    values(p_event,v_invite.team_id,v_invite.id,v_hash,v_name,v_phone) returning * into v_registration;
  insert into public.registration_join_ops values(p_op_id,p_event,v_hash,v_registration.id);
  perform public.audit(p_event,'PLAYER_REGISTERED','player_registration',v_registration.id,null,
    jsonb_build_object('team_id',v_registration.team_id,'invite_id',v_invite.id));
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.registration_receipt(v_registration.id);
end $$;

create function public.get_team_players(p_event uuid,p_team uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.can_manage_team_players(p_event,p_team) then perform public.phase2_fail('FORBIDDEN'); end if;
  return jsonb_build_object('registration_open',(select registration_open from public.events where id=p_event),
    'admin',public.is_event_admin(p_event),
    'invites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'token',token,'enabled',enabled,
      'expires_at',expires_at,'created_at',created_at) order by created_at desc,id)
      from public.team_invites where event_id=p_event and team_id=p_team),'[]'::jsonb),
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'phone',r.phone,
      'team_id',r.team_id,'invite_id',r.invite_id,'status',r.status,'version',r.version,'removed_batch',r.removed_batch,
      'created_at',r.created_at,'possible_duplicate',exists(select 1 from public.player_registrations other
        where other.event_id=p_event and other.id<>r.id and other.status='ACTIVE'
        and (lower(other.name)=lower(r.name) or (r.phone is not null and other.phone=r.phone))))
      order by r.created_at,r.id) from public.player_registrations r where r.event_id=p_event and r.team_id=p_team),'[]'::jsonb));
end $$;

create function public.manage_team_invite(p_op_id uuid,p_event uuid,p_team uuid,p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous jsonb; v_invite public.team_invites; v_result jsonb;
begin
  if not public.can_manage_team_players(p_event,p_team) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_previous:=public.op_result(p_op_id,'manage_team_invite:'||p_event||':'||p_team);
  if v_previous is not null then return v_previous; end if;
  perform public.phase2_event_lock(p_event);
  if not public.can_manage_team_players(p_event,p_team) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_action is null or p_action not in ('CREATE','REPLACE','DISABLE') then perform public.phase2_fail('INVALID_ACTION'); end if;
  select * into v_invite from public.team_invites where team_id=p_team and enabled;
  if p_action='CREATE' and v_invite.id is not null and v_invite.expires_at>now() then
    return public.op_complete(p_op_id,'manage_team_invite:'||p_event||':'||p_team,jsonb_build_object('id',v_invite.id)); end if;
  update public.team_invites set enabled=false where team_id=p_team and enabled;
  if p_action<>'DISABLE' then
    insert into public.team_invites(event_id,team_id,created_by) values(p_event,p_team,public.current_member_id()) returning * into v_invite;
  end if;
  v_result:=jsonb_build_object('id',v_invite.id,'action',p_action);
  perform public.audit(p_event,'TEAM_INVITE_'||p_action,'team',p_team,null,v_result);
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'manage_team_invite:'||p_event||':'||p_team,v_result);
end $$;

create function public.set_player_registration_open(p_op_id uuid,p_event uuid,p_open boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous jsonb; v_before boolean;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_previous:=public.op_result(p_op_id,'set_player_registration_open:'||p_event);
  if v_previous is not null then return v_previous; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_open is null then perform public.phase2_fail('INVALID_SETTINGS'); end if;
  select registration_open into v_before from public.events where id=p_event;
  if not found then perform public.phase2_fail('NOT_FOUND'); end if;
  update public.events set registration_open=p_open where id=p_event;
  perform public.audit(p_event,'REGISTRATION_OPEN_CHANGED','event',p_event,to_jsonb(v_before),to_jsonb(p_open));
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'set_player_registration_open:'||p_event,jsonb_build_object('open',p_open));
end $$;

create function public.correct_player_registration(p_op_id uuid,p_event uuid,p_registration uuid,p_version integer,
  p_action text,p_name text default null,p_phone text default null,p_team uuid default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.player_registrations; v_before jsonb; v_previous jsonb; v_phone text; v_name text;
begin
  select * into v_row from public.player_registrations where id=p_registration and event_id=p_event;
  if not found or not public.can_manage_team_players(p_event,v_row.team_id) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_action='TRANSFER' and not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_previous:=public.op_result(p_op_id,'correct_player_registration:'||p_event||':'||p_registration);
  if v_previous is not null then return v_previous; end if;
  perform public.phase2_event_lock(p_event);
  select * into v_row from public.player_registrations where id=p_registration for update;
  if not public.can_manage_team_players(p_event,v_row.team_id) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_action='TRANSFER' and not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if p_version is distinct from v_row.version then perform public.phase2_fail('REGISTRATION_CHANGED'); end if;
  if p_action is null or p_action not in ('EDIT','REMOVE','RESTORE','TRANSFER') then perform public.phase2_fail('INVALID_ACTION'); end if;
  if nullif(btrim(p_reason),'') is null or char_length(p_reason)>300 then perform public.phase2_fail('REASON_REQUIRED'); end if;
  if p_action='TRANSFER' and not exists(select 1 from public.teams where id=p_team and event_id=p_event) then perform public.phase2_fail('INVALID_TEAM'); end if;
  if p_action='EDIT' then
    v_name:=btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g'));
    v_phone:=nullif(public.normalize_member_phone(p_phone),'');
    if char_length(v_name) not between 1 and 100 then perform public.phase2_fail('INVALID_PLAYER_NAME'); end if;
    if nullif(btrim(p_phone),'') is not null and (v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$') then perform public.phase2_fail('INVALID_PHONE'); end if;
  end if;
  v_before:=to_jsonb(v_row)-'device_hash'-'phone';
  update public.player_registrations set
    name=case when p_action='EDIT' then v_name else name end,
    phone=case when p_action='EDIT' then v_phone else phone end,
    team_id=case when p_action='TRANSFER' then p_team else team_id end,
    status=case when p_action='REMOVE' then 'REMOVED' when p_action='RESTORE' then 'ACTIVE' else status end,
    removed_batch=null,version=version+1,updated_at=clock_timestamp()
    where id=p_registration returning * into v_row;
  perform public.audit(p_event,'PLAYER_'||p_action,'player_registration',p_registration,v_before,
    (to_jsonb(v_row)-'device_hash'-'phone')||jsonb_build_object('reason',btrim(p_reason)));
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'correct_player_registration:'||p_event||':'||p_registration,public.registration_receipt(p_registration));
end $$;

create function public.preview_invite_rollback(p_event uuid,p_invite uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.team_invites where id=p_invite and event_id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version,'name',name) order by id)
    from public.player_registrations where event_id=p_event and invite_id=p_invite and status='ACTIVE'),'[]'::jsonb);
end $$;

create function public.rollback_invite_registrations(p_op_id uuid,p_event uuid,p_invite uuid,p_expected jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous jsonb; v_snapshot jsonb; v_count integer;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_previous:=public.op_result(p_op_id,'rollback_invite_registrations:'||p_event);
  if v_previous is not null then return v_previous; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if nullif(btrim(p_reason),'') is null or char_length(p_reason)>300 then perform public.phase2_fail('REASON_REQUIRED'); end if;
  v_snapshot:=public.preview_invite_rollback(p_event,p_invite);
  if v_snapshot is distinct from p_expected then perform public.phase2_fail('REGISTRATION_CHANGED'); end if;
  update public.player_registrations set status='REMOVED',removed_batch=p_op_id,version=version+1,updated_at=clock_timestamp()
    where event_id=p_event and invite_id=p_invite and status='ACTIVE';
  get diagnostics v_count=row_count;
  perform public.audit(p_event,'PLAYER_BATCH_REMOVED','team_invite',p_invite,null,
    jsonb_build_object('batch_id',p_op_id,'count',v_count,'reason',btrim(p_reason),'players',v_snapshot));
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'rollback_invite_registrations:'||p_event,jsonb_build_object('batch_id',p_op_id,'count',v_count));
end $$;

create function public.restore_registration_batch(p_op_id uuid,p_event uuid,p_batch uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous jsonb; v_count integer;
begin
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  v_previous:=public.op_result(p_op_id,'restore_registration_batch:'||p_event);
  if v_previous is not null then return v_previous; end if;
  perform public.phase2_event_lock(p_event);
  if not public.is_event_admin(p_event) then perform public.phase2_fail('FORBIDDEN'); end if;
  if nullif(btrim(p_reason),'') is null or char_length(p_reason)>300 then perform public.phase2_fail('REASON_REQUIRED'); end if;
  update public.player_registrations set status='ACTIVE',removed_batch=null,version=version+1,updated_at=clock_timestamp()
    where event_id=p_event and removed_batch=p_batch and status='REMOVED';
  get diagnostics v_count=row_count;
  perform public.audit(p_event,'PLAYER_BATCH_RESTORED','registration_batch',p_batch,null,
    jsonb_build_object('count',v_count,'reason',btrim(p_reason)));
  perform public.emit(p_event,'roster_changed','{}'::jsonb);
  return public.op_complete(p_op_id,'restore_registration_batch:'||p_event,jsonb_build_object('count',v_count));
end $$;

revoke execute on function public.can_manage_team_players(uuid,uuid),public.registration_device_hash(text),
  public.registration_receipt(uuid),public.get_player_registration(uuid,text),public.get_team_invite(uuid,text),
  public.join_team_invite(uuid,uuid,text,text,text,text),public.get_team_players(uuid,uuid),
  public.manage_team_invite(uuid,uuid,uuid,text),public.set_player_registration_open(uuid,uuid,boolean),
  public.correct_player_registration(uuid,uuid,uuid,integer,text,text,text,uuid,text),
  public.preview_invite_rollback(uuid,uuid),public.rollback_invite_registrations(uuid,uuid,uuid,jsonb,text),
  public.restore_registration_batch(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.get_team_invite(uuid,text),public.get_player_registration(uuid,text),
  public.join_team_invite(uuid,uuid,text,text,text,text) to anon,authenticated,service_role;
grant execute on function public.get_team_players(uuid,uuid),public.manage_team_invite(uuid,uuid,uuid,text),
  public.set_player_registration_open(uuid,uuid,boolean),public.correct_player_registration(uuid,uuid,uuid,integer,text,text,text,uuid,text),
  public.preview_invite_rollback(uuid,uuid),public.rollback_invite_registrations(uuid,uuid,uuid,jsonb,text),
  public.restore_registration_batch(uuid,uuid,uuid,text) to authenticated,service_role;
