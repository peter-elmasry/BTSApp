-- One event-scoped test marker; private device/queue data stays private.
create table public.event_notification_tests (
  event_id uuid primary key references public.events(id) on delete cascade,
  test_id uuid not null,
  occurred_at timestamptz not null
);
alter table public.event_notification_tests enable row level security;
revoke all on public.event_notification_tests from public,anon,authenticated;

create function public.get_notification_test(p_event uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('serverNow',clock_timestamp(),'test',(
    select jsonb_build_object('id',t.test_id,'occurredAt',t.occurred_at)
    from public.event_notification_tests t join public.events e on e.id=t.event_id
    where t.event_id=p_event and e.is_current and e.status in ('DRAFT','LIVE')
      and t.occurred_at between clock_timestamp()-interval '10 seconds' and clock_timestamp()
  ))
$$;
revoke execute on function public.get_notification_test(uuid) from public,anon,authenticated;
grant execute on function public.get_notification_test(uuid) to anon,authenticated,service_role;

create function public.test_event_notifications(p_op_id uuid,p_event uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing jsonb; v_result jsonb; v_at timestamptz; v_test uuid:=gen_random_uuid(); v_count int;
begin
  if not public.is_event_admin(p_event) then raise exception using errcode='P0001',message='FORBIDDEN'; end if;
  v_existing:=public.op_result(p_op_id,'test_event_notifications');
  if v_existing is not null then return v_existing; end if;
  -- The event row serializes different administrators and the very first test.
  perform 1 from public.events where id=p_event and is_current and status in ('DRAFT','LIVE') for update;
  if not found then raise exception using errcode='P0001',message='EVENT_UNAVAILABLE'; end if;
  v_at:=clock_timestamp();
  if exists(select 1 from public.event_notification_tests where event_id=p_event and occurred_at>v_at-interval '1 minute') then
    raise exception using errcode='P0001',message='TEST_RATE_LIMITED';
  end if;
  insert into public.event_notification_tests(event_id,test_id,occurred_at) values(p_event,v_test,v_at)
    on conflict(event_id) do update set test_id=excluded.test_id,occurred_at=excluded.occurred_at;
  insert into public.round_push_deliveries(occurrence,receipt_hash,event_id,cue,occurred_at)
    select v_test,d.receipt_hash,p_event,'test',v_at from public.round_push_devices d
    where d.event_id=p_event and d.expires_at>v_at;
  get diagnostics v_count=row_count;
  v_result:=jsonb_build_object('id',v_test,'occurredAt',v_at,'devices',v_count);
  perform public.audit(p_event,'NOTIFICATION_TEST','event',p_event,null,jsonb_build_object('id',v_test));
  perform public.emit(p_event,'settings_changed','{}'::jsonb);
  perform public.wake_round_push();
  return public.op_complete(p_op_id,'test_event_notifications',v_result);
end $$;
revoke execute on function public.test_event_notifications(uuid,uuid) from public,anon,authenticated;
grant execute on function public.test_event_notifications(uuid,uuid) to authenticated;
