-- D076: private independent appointments. All mutations share one small-domain
-- transaction lock, including overlap checks across sessions and actor roles.
create table public.appointment_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(btrim(title)) between 1 and 120),
  description text not null default '' check(length(description)<=2000),
  location text not null default '' check(length(location)<=500),
  meeting_url text not null default '' check(meeting_url='' or meeting_url ~ '^https://[^[:space:]]+$'),
  timezone text not null default 'Africa/Cairo',
  event_id uuid references public.events(id) on delete restrict,
  status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','CLOSED','CANCELLED')),
  opens_at timestamptz not null,
  closes_at timestamptz not null check(closes_at>opens_at),
  cutoff_minutes int not null default 60 check(cutoff_minutes between 0 and 10080),
  version int not null default 1,
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now()
);
create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.appointment_sessions(id) on delete restrict,
  interviewer_id uuid not null references public.members(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at),
  blocked boolean not null default false,
  version int not null default 1,
  unique(id,session_id)
);
create index appointment_slots_interviewer_time on public.appointment_slots(interviewer_id,starts_at);
create index appointment_slots_session_time on public.appointment_slots(session_id,starts_at);
create table public.appointment_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.appointment_sessions(id) on delete restrict,
  slot_id uuid not null,
  member_id uuid not null references public.members(id) on delete restrict,
  display_name text not null check(length(btrim(display_name)) between 1 and 80),
  status text not null default 'BOOKED' check(status in ('BOOKED','COMPLETED','NO_SHOW','CANCELLED')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  foreign key(slot_id,session_id) references public.appointment_slots(id,session_id) on delete restrict
);
-- Attendance never frees a slot or allows an extra booking in the same session.
create unique index appointment_one_slot on public.appointment_bookings(slot_id) where status<>'CANCELLED';
create unique index appointment_one_member on public.appointment_bookings(session_id,member_id) where status<>'CANCELLED';
create index appointment_bookings_member on public.appointment_bookings(member_id,session_id);
alter table public.appointment_sessions enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointment_bookings enable row level security;
revoke all on public.appointment_sessions,public.appointment_slots,public.appointment_bookings from public,anon,authenticated;

create function public.appointment_actor() returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid;
begin
  -- Row share synchronizes with account deactivation/password resets.
  select id into v_actor from public.members where auth_user_id=auth.uid()
    and is_active and not must_change_password for share;
  if v_actor is null then raise exception 'FORBIDDEN'; end if;
  return v_actor;
end $$;

create function public.list_appointment_sessions() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.appointment_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'title',s.title,'description',s.description,'location',s.location,
    'timezone',s.timezone,'status',s.status,'opens_at',s.opens_at,'closes_at',s.closes_at,
    'event_id',s.event_id,'version',s.version,
    'interviewer',exists(select 1 from public.appointment_slots t where t.session_id=s.id and t.interviewer_id=v_actor),
    'available', (select count(*) from public.appointment_slots t
      join public.members m on m.id=t.interviewer_id and m.is_active and m.auth_user_id is not null and not m.must_change_password
      where t.session_id=s.id and not t.blocked and t.starts_at>clock_timestamp()
      and not exists(select 1 from public.appointment_bookings b where b.slot_id=t.id and b.status<>'CANCELLED'))
    ) order by s.created_at desc) from public.appointment_sessions s
    where public.is_owner() or s.status<>'DRAFT'
      or exists(select 1 from public.appointment_slots t where t.session_id=s.id and t.interviewer_id=v_actor)), '[]'::jsonb);
end $$;

create function public.get_appointment_session(p_session uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.appointment_actor(); v_session public.appointment_sessions; v_owner boolean:=public.is_owner();
begin
  select * into v_session from public.appointment_sessions where id=p_session;
  if not found or (v_session.status='DRAFT' and not v_owner and not exists(
    select 1 from public.appointment_slots where session_id=p_session and interviewer_id=v_actor)) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object('session',to_jsonb(v_session),'slots',coalesce((
    select jsonb_agg(jsonb_build_object('id',t.id,'session_id',t.session_id,
      'interviewer_id',t.interviewer_id,'interviewer_name',coalesce(m.full_name_ar,m.full_name_en),
      'starts_at',t.starts_at,'ends_at',t.ends_at,'blocked',t.blocked,'version',t.version,
      'available',not t.blocked and m.is_active and m.auth_user_id is not null
        and not m.must_change_password and t.starts_at>clock_timestamp()
        and not exists(select 1 from public.appointment_bookings b where b.slot_id=t.id and b.status<>'CANCELLED'),
      'booking',(select jsonb_build_object('id',b.id,'member_id',b.member_id,'display_name',b.display_name,
        'status',b.status,'version',b.version) from public.appointment_bookings b
        where b.slot_id=t.id and b.status<>'CANCELLED'
        and (v_owner or t.interviewer_id=v_actor or b.member_id=v_actor))) order by t.starts_at,t.id)
    from public.appointment_slots t join public.members m on m.id=t.interviewer_id where t.session_id=p_session
      and (v_session.status<>'DRAFT' or v_owner or t.interviewer_id=v_actor)), '[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'member_id',b.member_id,
      'display_name',b.display_name,'status',b.status,'version',b.version,'starts_at',t.starts_at,'ends_at',t.ends_at)
      order by b.created_at desc,b.id) from public.appointment_bookings b join public.appointment_slots t on t.id=b.slot_id
      where b.session_id=p_session and b.status='CANCELLED' and (v_owner or b.member_id=v_actor or t.interviewer_id=v_actor)), '[]'::jsonb));
end $$;

create function public.get_my_appointments(p_interviewer boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.appointment_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'session_id',s.id,'title',s.title,
    'display_name',b.display_name,'member_id',b.member_id,'slot_id',t.id,'status',b.status,'version',b.version,
    'starts_at',t.starts_at,'ends_at',t.ends_at,'timezone',s.timezone,'location',s.location,'meeting_url',s.meeting_url,
    'interviewer_name',coalesce(m.full_name_ar,m.full_name_en),'cutoff_minutes',s.cutoff_minutes,
    'session_status',s.status) order by t.starts_at,b.id)
    from public.appointment_bookings b join public.appointment_slots t on t.id=b.slot_id
    join public.appointment_sessions s on s.id=b.session_id join public.members m on m.id=t.interviewer_id
    where (not p_interviewer and b.member_id=v_actor) or (p_interviewer and t.interviewer_id=v_actor)), '[]'::jsonb);
end $$;

create function public.get_appointment_options() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.appointment_actor();
  if not public.is_owner() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',coalesce(full_name_ar,full_name_en)) order by full_name_en)
    from public.members where is_active and auth_user_id is not null and not must_change_password),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',coalesce(name_ar,name_en)) order by created_at desc) from public.events),'[]'::jsonb));
end $$;

create function public.get_appointment_operation(p_op_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.appointment_actor();
begin
  return (select result from public.client_ops where op_id=p_op_id and actor_id=v_actor and rpc_name like 'appointment_write:%');
end $$;

-- Called only while the domain lock is held. Half-open intervals allow back-to-back appointments.
create function public.appointment_check_slot(p_interviewer uuid,p_start timestamptz,p_end timestamptz,p_exclude uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.members where id=p_interviewer and is_active and auth_user_id is not null and not must_change_password for share;
  if not found then raise exception 'INTERVIEWER_UNAVAILABLE'; end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_start<=clock_timestamp() or p_end<=p_start or p_end>p_start+interval '12 hours' then raise exception 'INVALID_APPOINTMENT'; end if;
  if exists(select 1 from public.appointment_slots t join public.appointment_sessions s on s.id=t.session_id
    where t.interviewer_id=p_interviewer and t.id is distinct from p_exclude and not t.blocked and s.status<>'CANCELLED'
      and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(p_start,p_end,'[)'))
    or exists(select 1 from public.appointment_bookings b join public.appointment_slots t on t.id=b.slot_id
      where b.member_id=p_interviewer and b.status<>'CANCELLED'
        and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(p_start,p_end,'[)')) then raise exception 'APPOINTMENT_OVERLAP'; end if;
end $$;

create function public.appointment_write(p_op_id uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_owner boolean; v_previous jsonb; v_key text; v_result jsonb;
  v_session public.appointment_sessions; v_slot public.appointment_slots; v_booking public.appointment_bookings;
  v_id uuid; v_session_id uuid; v_start timestamptz; v_end timestamptz; v_until timestamptz;
  v_interviewer uuid; v_duration int; v_gap int; v_count int:=0; v_status text; v_name text;
begin
  -- One deterministic lock order for all writes and all sessions; no check/write races.
  perform pg_advisory_xact_lock(hashtextextended('dst:appointments',0));
  v_actor:=public.appointment_actor(); v_owner:=public.is_owner();
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_action is null then raise exception 'INVALID_APPOINTMENT'; end if;
  v_key:='appointment_write:'||p_action||':'||md5(p_payload::text);
  v_previous:=public.op_result(p_op_id,v_key);
  if v_previous is not null then return v_previous; end if;
  if p_action in ('SAVE_SESSION','GENERATE_SLOTS','SAVE_SLOT') and not v_owner then raise exception 'FORBIDDEN'; end if;

  if p_action='SAVE_SESSION' then
    v_id:=nullif(p_payload->>'id','')::uuid;
    if v_id is not null then
      select * into v_session from public.appointment_sessions where id=v_id for update;
      if not found then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
      if v_session.version is distinct from (p_payload->>'version')::int then raise exception 'APPOINTMENT_CHANGED'; end if;
      if v_session.status='CANCELLED' then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
    end if;
    v_status:=p_payload->>'status';
    v_start:=(p_payload->>'opens_at')::timestamptz; v_end:=(p_payload->>'closes_at')::timestamptz;
    if coalesce(length(btrim(p_payload->>'title')),0) not between 1 and 120
      or v_status is null or v_status not in ('DRAFT','PUBLISHED','CLOSED','CANCELLED')
      or v_start is null or v_end is null or not isfinite(v_start) or not isfinite(v_end) or v_end<=v_start
      or not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone')
      or coalesce((p_payload->>'cutoff_minutes')::int,-1) not between 0 and 10080
      or length(coalesce(p_payload->>'description',''))>2000 or length(coalesce(p_payload->>'location',''))>500
      or length(coalesce(p_payload->>'meeting_url',''))>2000
      or (coalesce(p_payload->>'meeting_url','')<>'' and (p_payload->>'meeting_url') !~ '^https://[^[:space:]]+$')
      then raise exception 'INVALID_APPOINTMENT'; end if;
    if v_id is not null and exists(select 1 from public.appointment_bookings where session_id=v_id and status<>'CANCELLED')
      and (v_status='DRAFT' or (v_session.location,v_session.meeting_url,v_session.timezone) is distinct from
        (coalesce(p_payload->>'location',''),coalesce(p_payload->>'meeting_url',''),p_payload->>'timezone')) then raise exception 'BOOKED_SLOT_LOCKED'; end if;
    if v_status='PUBLISHED' and not exists(select 1 from public.appointment_slots where session_id=v_id and not blocked and starts_at>clock_timestamp()) then raise exception 'SLOTS_REQUIRED'; end if;
    if v_id is null then
      insert into public.appointment_sessions(title,description,location,meeting_url,timezone,event_id,status,opens_at,closes_at,cutoff_minutes,created_by)
      values(btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'location',''),coalesce(p_payload->>'meeting_url',''),
        p_payload->>'timezone',nullif(p_payload->>'event_id','')::uuid,v_status,v_start,v_end,(p_payload->>'cutoff_minutes')::int,v_actor) returning * into v_session;
    else
      update public.appointment_sessions set title=btrim(p_payload->>'title'),description=coalesce(p_payload->>'description',''),
        location=coalesce(p_payload->>'location',''),meeting_url=coalesce(p_payload->>'meeting_url',''),timezone=p_payload->>'timezone',
        event_id=nullif(p_payload->>'event_id','')::uuid,status=v_status,opens_at=v_start,closes_at=v_end,
        cutoff_minutes=(p_payload->>'cutoff_minutes')::int,version=version+1 where id=v_id returning * into v_session;
      if v_status='CANCELLED' then update public.appointment_bookings set status='CANCELLED',version=version+1 where session_id=v_id and status='BOOKED'; end if;
    end if;
    v_id:=v_session.id; v_result:=jsonb_build_object('id',v_id,'version',v_session.version);

  elsif p_action in ('GENERATE_SLOTS','SAVE_SLOT') then
    v_session_id:=(p_payload->>'session_id')::uuid;
    select * into v_session from public.appointment_sessions where id=v_session_id for update;
    if not found or v_session.status in ('CLOSED','CANCELLED') then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
    v_interviewer:=(p_payload->>'interviewer_id')::uuid;
    v_start:=(p_payload->>'starts_at')::timestamptz; v_end:=(p_payload->>'ends_at')::timestamptz;
    if p_action='SAVE_SLOT' then
      v_id:=nullif(p_payload->>'id','')::uuid;
      if v_id is not null then
        select * into v_slot from public.appointment_slots where id=v_id and session_id=v_session_id for update;
        if not found then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
        if v_slot.version is distinct from (p_payload->>'version')::int then raise exception 'APPOINTMENT_CHANGED'; end if;
        if exists(select 1 from public.appointment_bookings where slot_id=v_id and status<>'CANCELLED') then raise exception 'BOOKED_SLOT_LOCKED'; end if;
      end if;
      -- Block operations preserve a valid interval too, but do not reserve the interviewer.
      if coalesce((p_payload->>'blocked')::boolean,false) then
        if v_id is null then raise exception 'INVALID_APPOINTMENT'; end if;
        v_interviewer:=v_slot.interviewer_id; v_start:=v_slot.starts_at; v_end:=v_slot.ends_at;
      else perform public.appointment_check_slot(v_interviewer,v_start,v_end,v_id); end if;
      if v_id is null then
        insert into public.appointment_slots(session_id,interviewer_id,starts_at,ends_at) values(v_session_id,v_interviewer,v_start,v_end) returning id into v_id;
      else
        update public.appointment_slots set interviewer_id=v_interviewer,starts_at=v_start,ends_at=v_end,
          blocked=coalesce((p_payload->>'blocked')::boolean,false),version=version+1 where id=v_id;
      end if;
      v_result:=jsonb_build_object('id',v_id);
    else
      v_duration:=(p_payload->>'duration_minutes')::int; v_gap:=(p_payload->>'gap_minutes')::int; v_until:=v_end;
      if v_duration is null or v_duration not between 5 and 240 or v_gap is null or v_gap not between 0 and 120
        or v_start is null or v_until is null or not isfinite(v_start) or not isfinite(v_until)
        or v_until<=v_start or v_until>v_start+interval '7 days' then raise exception 'INVALID_APPOINTMENT'; end if;
      while v_start+make_interval(mins=>v_duration)<=v_until loop
        v_end:=v_start+make_interval(mins=>v_duration);
        perform public.appointment_check_slot(v_interviewer,v_start,v_end);
        insert into public.appointment_slots(session_id,interviewer_id,starts_at,ends_at) values(v_session_id,v_interviewer,v_start,v_end);
        v_count:=v_count+1;
        if v_count>200 then raise exception 'INVALID_APPOINTMENT'; end if;
        v_start:=v_end+make_interval(mins=>v_gap);
      end loop;
      if v_count=0 then raise exception 'INVALID_APPOINTMENT'; end if;
      v_id:=v_session_id; v_result:=jsonb_build_object('id',v_id,'count',v_count);
    end if;

  elsif p_action in ('BOOK','RESCHEDULE','CANCEL','ATTEND') then
    if p_action<>'BOOK' then
      select * into v_booking from public.appointment_bookings where id=(p_payload->>'booking_id')::uuid for update;
      if not found then raise exception 'FORBIDDEN'; end if;
      select * into v_slot from public.appointment_slots where id=v_booking.slot_id;
      if not v_owner and v_booking.member_id<>v_actor and not(p_action='ATTEND' and v_slot.interviewer_id=v_actor) then raise exception 'FORBIDDEN'; end if;
      if p_action='ATTEND' and not v_owner and v_slot.interviewer_id<>v_actor then raise exception 'FORBIDDEN'; end if;
      if v_booking.version is distinct from (p_payload->>'version')::int then raise exception 'APPOINTMENT_CHANGED'; end if;
      if v_booking.status<>'BOOKED' then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
      select * into v_session from public.appointment_sessions where id=v_booking.session_id;
      if p_action in ('CANCEL','RESCHEDULE') and not v_owner and clock_timestamp()>=v_slot.starts_at-make_interval(mins=>v_session.cutoff_minutes) then raise exception 'CUTOFF_PASSED'; end if;
    end if;
    if p_action in ('BOOK','RESCHEDULE') then
      select * into v_slot from public.appointment_slots where id=(p_payload->>'slot_id')::uuid for update;
      if not found then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
      if p_action='RESCHEDULE' and (v_slot.session_id<>v_booking.session_id or v_slot.id=v_booking.slot_id) then raise exception 'INVALID_APPOINTMENT'; end if;
      select * into v_session from public.appointment_sessions where id=v_slot.session_id;
      if v_session.status<>'PUBLISHED' or clock_timestamp()<v_session.opens_at or clock_timestamp()>=v_session.closes_at
        or v_slot.blocked or v_slot.starts_at<=clock_timestamp() then raise exception 'APPOINTMENT_UNAVAILABLE'; end if;
      perform 1 from public.members where id=v_slot.interviewer_id and is_active and auth_user_id is not null and not must_change_password for share;
      if not found then raise exception 'INTERVIEWER_UNAVAILABLE'; end if;
      if exists(select 1 from public.appointment_bookings where slot_id=v_slot.id and status<>'CANCELLED') then raise exception 'SLOT_TAKEN'; end if;
      -- Owners reschedule for the original attendee, never for themselves.
      v_id:=case when p_action='BOOK' then v_actor else v_booking.member_id end;
      if v_id=v_slot.interviewer_id then raise exception 'APPOINTMENT_OVERLAP'; end if;
      if exists(select 1 from public.appointment_bookings where session_id=v_session.id and member_id=v_id and status<>'CANCELLED' and id is distinct from v_booking.id) then raise exception 'ALREADY_BOOKED'; end if;
      if exists(select 1 from public.appointment_bookings b join public.appointment_slots t on t.id=b.slot_id
        where b.member_id=v_id and b.status<>'CANCELLED' and b.id is distinct from v_booking.id
          and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(v_slot.starts_at,v_slot.ends_at,'[)'))
        or exists(select 1 from public.appointment_slots t join public.appointment_sessions s on s.id=t.session_id
          where t.interviewer_id=v_id and not t.blocked and s.status<>'CANCELLED'
          and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(v_slot.starts_at,v_slot.ends_at,'[)')) then raise exception 'APPOINTMENT_OVERLAP'; end if;
      if p_action='BOOK' then
        v_name:=btrim(p_payload->>'display_name');
        if v_name is null or length(v_name) not between 1 and 80 then raise exception 'INVALID_NAME'; end if;
        insert into public.appointment_bookings(session_id,slot_id,member_id,display_name) values(v_session.id,v_slot.id,v_actor,v_name) returning * into v_booking;
      else update public.appointment_bookings set slot_id=v_slot.id,version=version+1 where id=v_booking.id returning * into v_booking; end if;
    elsif p_action='CANCEL' then
      update public.appointment_bookings set status='CANCELLED',version=version+1 where id=v_booking.id returning * into v_booking;
    else
      v_status:=p_payload->>'status';
      if v_status is null or v_status not in ('COMPLETED','NO_SHOW') or v_slot.starts_at>clock_timestamp() then raise exception 'INVALID_ATTENDANCE'; end if;
      update public.appointment_bookings set status=v_status,version=version+1 where id=v_booking.id returning * into v_booking;
    end if;
    v_id:=v_booking.id;
    v_result:=jsonb_build_object('id',v_id,'version',v_booking.version,'status',v_booking.status,'slot_id',v_booking.slot_id);
  else raise exception 'INVALID_APPOINTMENT'; end if;
  -- Independent audit scope; no private payloads, names or meeting URLs in broadcasts.
  perform public.audit(null,'APPOINTMENT_'||p_action,'appointment',v_id,null,v_result);
  return public.op_complete(p_op_id,v_key,v_result);
end $$;

revoke all on function public.appointment_actor(),public.appointment_check_slot(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.list_appointment_sessions(),public.get_appointment_session(uuid),public.get_my_appointments(boolean),public.get_appointment_options(),public.get_appointment_operation(uuid),public.appointment_write(uuid,text,jsonb) from public,anon;
grant execute on function public.list_appointment_sessions(),public.get_appointment_session(uuid),public.get_my_appointments(boolean),public.get_appointment_options(),public.get_appointment_operation(uuid),public.appointment_write(uuid,text,jsonb) to authenticated;
