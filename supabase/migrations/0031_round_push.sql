-- D069: private device subscriptions and an expiring transactional delivery outbox.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
-- pg_net request headers contain the dispatch credential while a request is queued.
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;

create table public.round_push_devices (
  receipt_hash text primary key check(receipt_hash ~ '^[a-f0-9]{64}$'),
  event_id uuid not null references public.events(id) on delete cascade,
  subscription jsonb not null,
  language text not null check(language in ('ar','en')),
  expires_at timestamptz not null default clock_timestamp()+interval '90 days',
  last_test_at timestamptz
);
create unique index round_push_endpoint on public.round_push_devices((subscription->>'endpoint'));
create index round_push_event on public.round_push_devices(event_id,expires_at);
create index round_push_expiry on public.round_push_devices(expires_at);
create table public.round_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  occurrence uuid not null,
  receipt_hash text not null references public.round_push_devices(receipt_hash) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete cascade,
  cue text not null check(cue in ('round-start','round-end','test')),
  occurred_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '2 minutes',
  available_at timestamptz not null default clock_timestamp(),
  attempts int not null default 0,
  lease uuid,
  completed boolean not null default false,
  unique(occurrence,receipt_hash)
);
create index round_push_pending on public.round_push_deliveries(available_at) where not completed;
create table public.round_push_admission (
  bucket text primary key,
  window_at timestamptz not null,
  attempts int not null
);
create index round_push_admission_expiry on public.round_push_admission(window_at);
alter table public.round_push_devices enable row level security;
alter table public.round_push_deliveries enable row level security;
alter table public.round_push_admission enable row level security;
revoke all on public.round_push_devices,public.round_push_deliveries,public.round_push_admission from public,anon,authenticated;

-- All entry points below are internal to the Edge service, never public RPCs.
create function public.round_push_config() returns jsonb
language sql security definer set search_path=public,pg_temp
as $$ select decrypted_secret::jsonb from vault.decrypted_secrets where name='round_push_runtime' $$;

create function public.configure_round_push(p_config jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_id uuid; begin
  if p_config is null or coalesce(p_config->>'origin','') !~ '^https://[a-zA-Z0-9.-]+$'
    or coalesce(p_config->>'publicKey','') !~ '^[A-Za-z0-9_-]{87}$'
    or coalesce(p_config->>'privateKey','') !~ '^[A-Za-z0-9_-]{43}$'
    or coalesce(p_config->>'dispatchSecret','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_config->>'functionUrl','') !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/round-push$'
    or (coalesce(p_config->>'subject','') !~ '^mailto:[^[:space:]]+@[^[:space:]]+$' and coalesce(p_config->>'subject','')<>p_config->>'origin')
    or not (p_config ?& array['origin','publicKey','privateKey','dispatchSecret','functionUrl','subject'])
  then raise exception 'INVALID_PUSH_CONFIG'; end if;
  select id into v_id from vault.secrets where name='round_push_runtime';
  if v_id is null then perform vault.create_secret(p_config::text,'round_push_runtime');
  else perform vault.update_secret(v_id,p_config::text,'round_push_runtime'); end if;
end $$;

create function public.round_push_admit(p_bucket text) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_count int; begin
  if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from public.round_push_admission where window_at<clock_timestamp()-interval '1 hour';
  insert into public.round_push_admission values(p_bucket,clock_timestamp(),1)
    on conflict(bucket) do update set attempts=round_push_admission.attempts+1
    returning attempts into v_count;
  -- Venue Wi-Fi shares one address: allow a whole event, not just a few phones.
  return v_count<=6000;
end $$;

create function public.save_round_push(p_receipt text,p_event uuid,p_subscription jsonb,p_language text)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  if p_receipt !~ '^[a-f0-9]{64}$' or p_receipt is null
    or p_language not in ('ar','en') or p_language is null
    or coalesce(p_subscription->>'endpoint','') !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/[^[:space:]]+$'
    or length(p_subscription->>'endpoint')>2048
    or coalesce(p_subscription#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}$'
    or coalesce(p_subscription#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}$'
    or not (p_subscription ? 'endpoint') or not ((p_subscription->'keys') ?& array['p256dh','auth'])
  then raise exception 'INVALID_SUBSCRIPTION'; end if;
  if not exists(select 1 from public.events where id=p_event and status in ('DRAFT','LIVE') and is_current)
    then raise exception 'EVENT_UNAVAILABLE'; end if;
  delete from public.round_push_devices where expires_at<=clock_timestamp();
  if (select count(*) from public.round_push_devices)>=20000 and not exists(select 1 from public.round_push_devices where receipt_hash=p_receipt)
    then raise exception 'PUSH_CAPACITY'; end if;
  -- An endpoint can only be replaced using its existing receipt, never taken over.
  insert into public.round_push_devices(receipt_hash,event_id,subscription,language)
    values(p_receipt,p_event,jsonb_build_object('endpoint',p_subscription->>'endpoint','keys',p_subscription->'keys'),p_language)
    on conflict(receipt_hash) do update set event_id=excluded.event_id,subscription=excluded.subscription,
      language=excluded.language,expires_at=clock_timestamp()+interval '90 days';
  delete from public.round_push_deliveries where receipt_hash=p_receipt and event_id<>p_event;
end $$;

create function public.remove_round_push(p_receipt text) returns void
language sql security definer set search_path=public,pg_temp
as $$ delete from public.round_push_devices where receipt_hash=p_receipt $$;

create function public.wake_round_push() returns void
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_config jsonb; begin
  delete from public.round_push_devices where expires_at<=clock_timestamp();
  delete from public.round_push_deliveries where expires_at<=clock_timestamp() or completed;
  delete from public.round_push_admission where window_at<clock_timestamp()-interval '1 hour';
  if not exists(select 1 from public.round_push_deliveries where not completed and attempts<4
    and available_at<=clock_timestamp() and expires_at>clock_timestamp()) then return; end if;
  v_config:=public.round_push_config();
  if v_config is null then return; end if;
  perform net.http_post(url:=v_config->>'functionUrl',
    headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',v_config->>'dispatchSecret'),
    body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=5000);
exception when others then raise warning 'ROUND_PUSH_WAKE_FAILED';
end $$;

create function public.test_round_push(p_receipt text) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_device public.round_push_devices; begin
  select * into v_device from public.round_push_devices where receipt_hash=p_receipt
    and expires_at>clock_timestamp() for update;
  if not found or v_device.last_test_at>clock_timestamp()-interval '1 minute' then return false; end if;
  update public.round_push_devices set last_test_at=clock_timestamp() where receipt_hash=p_receipt;
  insert into public.round_push_deliveries(occurrence,receipt_hash,event_id,cue)
    values(gen_random_uuid(),p_receipt,v_device.event_id,'test');
  perform public.wake_round_push();
  return true;
end $$;

create function public.queue_round_push() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_cue text; v_occurrence uuid:=gen_random_uuid(); begin
  v_cue:=case when old.status='DRAFT' and new.status='ACTIVE' then 'round-start'
    when old.status='ACTIVE' and new.status='CLOSED' then 'round-end' end;
  if v_cue is null then return new; end if;
  insert into public.round_push_deliveries(occurrence,receipt_hash,event_id,round_id,cue)
    select v_occurrence,d.receipt_hash,new.event_id,new.id,v_cue from public.round_push_devices d
    join public.events e on e.id=d.event_id
    where d.event_id=new.event_id and d.expires_at>clock_timestamp() and e.is_current and e.status in ('DRAFT','LIVE');
  perform public.wake_round_push();
  return new;
exception when others then
  -- Notifications never reject a scoring/round transaction; no partial queue survives this block.
  raise warning 'ROUND_PUSH_QUEUE_FAILED'; return new;
end $$;
create trigger round_push_committed after update of status on public.rounds
for each row when(old.status is distinct from new.status) execute function public.queue_round_push();

create function public.claim_round_push(p_limit int default 100) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_rows jsonb; begin
  delete from public.round_push_devices where expires_at<=clock_timestamp();
  delete from public.round_push_deliveries where expires_at<=clock_timestamp() or completed or (attempts>=4 and available_at<=clock_timestamp());
  with picked as (
    select q.id from public.round_push_deliveries q join public.events e on e.id=q.event_id
    where not q.completed and q.available_at<=clock_timestamp() and q.expires_at>clock_timestamp()
      and q.attempts<4 and e.is_current and e.status in ('DRAFT','LIVE','FINISHED')
    order by q.occurred_at,q.id for update of q skip locked limit greatest(1,least(p_limit,100))
  ), leased as (
    update public.round_push_deliveries q set attempts=attempts+1,lease=gen_random_uuid(),
      available_at=clock_timestamp()+interval '90 seconds' from picked where q.id=picked.id returning q.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'lease',q.lease,'occurrence',q.occurrence,
      'cue',q.cue,'expiresAt',q.expires_at,'subscription',d.subscription,'language',d.language,
      'eventName',case when d.language='ar' then coalesce(e.name_ar,e.name_en) else e.name_en end,
      'roundNumber',r.number)), '[]'::jsonb) into v_rows
    from leased q join public.round_push_devices d on d.receipt_hash=q.receipt_hash
    join public.events e on e.id=q.event_id left join public.rounds r on r.id=q.round_id;
  return v_rows;
end $$;

create function public.finish_round_push(p_id uuid,p_lease uuid,p_status int) returns void
language plpgsql security definer set search_path=public,pg_temp
as $$ declare v_receipt text; begin
  select receipt_hash into v_receipt from public.round_push_deliveries where id=p_id and lease=p_lease for update;
  if not found then return; end if;
  if p_status in (404,410) then delete from public.round_push_devices where receipt_hash=v_receipt;
  else update public.round_push_deliveries set completed=(p_status between 200 and 299 or (p_status between 400 and 499 and p_status<>429)),
    available_at=clock_timestamp()+make_interval(secs=>least(60,attempts*10)),lease=null where id=p_id; end if;
end $$;

revoke execute on function public.round_push_config(),public.configure_round_push(jsonb),public.round_push_admit(text),
  public.save_round_push(text,uuid,jsonb,text),public.remove_round_push(text),public.test_round_push(text),
  public.wake_round_push(),public.queue_round_push(),public.claim_round_push(int),public.finish_round_push(uuid,uuid,int)
  from public,anon,authenticated;
grant execute on function public.round_push_config(),public.configure_round_push(jsonb),public.round_push_admit(text),
  public.save_round_push(text,uuid,jsonb,text),public.remove_round_push(text),public.test_round_push(text),
  public.claim_round_push(int),public.finish_round_push(uuid,uuid,int),public.wake_round_push() to service_role;
select cron.schedule('round-push-retry','* * * * *','select public.wake_round_push()');
