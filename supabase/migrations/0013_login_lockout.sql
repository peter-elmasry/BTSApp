-- Login admission is serialized per normalized identifier. No credential material
-- is stored; only the Edge Function's service role can use these functions.
create table public.login_limits (
  identifier text primary key,
  locked_until timestamptz
);
create table public.login_pending (
  id uuid primary key default gen_random_uuid(),
  identifier text not null references public.login_limits(identifier) on delete cascade,
  expires_at timestamptz not null
);
create index login_pending_identifier_idx on public.login_pending(identifier);
alter table public.login_limits enable row level security;
alter table public.login_pending enable row level security;
revoke all on public.login_limits, public.login_pending from public, anon, authenticated;
grant all on public.login_limits, public.login_pending to service_role;

-- Preserve locks implied by attempts recorded by the previous handler, including
-- a fifth failure still within ten minutes whose first failure has aged out.
insert into public.login_limits(identifier, locked_until)
select latest.identifier, latest.at + interval '10 minutes'
from (
  select identifier, max(attempted_at) as at from public.login_attempts
  where not success and attempted_at > now() - interval '10 minutes'
  group by identifier
) latest
where (select count(*) from public.login_attempts a
       where a.identifier = latest.identifier and not a.success
       and a.attempted_at between latest.at - interval '10 minutes' and latest.at) >= 5;

create function public.begin_login_attempt(p_identifier text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_now timestamptz; v_locked timestamptz; v_failures integer; v_pending integer; v_id uuid;
begin
  if p_identifier is null or length(p_identifier) not between 3 and 30
     or p_identifier <> lower(trim(p_identifier)) then
    raise exception using errcode = 'P0001', message = 'INVALID_IDENTIFIER';
  end if;
  insert into public.login_limits(identifier) values(p_identifier) on conflict do nothing;
  select locked_until into v_locked from public.login_limits where identifier = p_identifier for update;
  v_now := clock_timestamp();
  if v_locked > v_now then return jsonb_build_object('status', 'locked'); end if;
  delete from public.login_pending where identifier = p_identifier and expires_at <= v_now;
  select count(*) into v_failures from public.login_attempts
    where identifier = p_identifier and not success
      and attempted_at >= greatest(v_now - interval '10 minutes', coalesce(v_locked, '-infinity'::timestamptz));
  select count(*) into v_pending from public.login_pending where identifier = p_identifier;
  -- Reserve capacity before contacting Auth: parallel requests cannot all pass
  -- the same failure count. Busy is transient and does not extend a lockout.
  if v_failures + v_pending >= 5 then return jsonb_build_object('status', 'busy'); end if;
  insert into public.login_pending(identifier, expires_at)
    values(p_identifier, v_now + interval '60 seconds') returning id into v_id;
  return jsonb_build_object('status', 'allowed', 'attempt_id', v_id);
end $$;

create function public.finish_login_attempt(p_attempt uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_identifier text; v_locked timestamptz; v_now timestamptz; v_failures integer;
begin
  if p_success is null then return false; end if;
  select identifier into v_identifier from public.login_pending where id = p_attempt;
  if not found then return false; end if;
  select locked_until into v_locked from public.login_limits where identifier = v_identifier for update;
  v_now := clock_timestamp();
  delete from public.login_pending where id = p_attempt and expires_at > v_now;
  if not found then return false; end if;
  insert into public.login_attempts(identifier, attempted_at, success) values(v_identifier, v_now, p_success);
  if not p_success then
    select count(*) into v_failures from public.login_attempts
      where identifier = v_identifier and not success
        and attempted_at >= greatest(v_now - interval '10 minutes', coalesce(v_locked, '-infinity'::timestamptz));
    if v_failures >= 5 and (v_locked is null or v_locked <= v_now) then
      update public.login_limits set locked_until = v_now + interval '10 minutes' where identifier = v_identifier;
    end if;
  end if;
  return true;
end $$;

revoke all on function public.begin_login_attempt(text), public.finish_login_attempt(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.begin_login_attempt(text), public.finish_login_attempt(uuid,boolean)
  to service_role;
