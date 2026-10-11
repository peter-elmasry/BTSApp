-- Temporary owner-set passwords must be changed by the member at first login.
alter table public.members add column if not exists must_change_password boolean not null default false;

-- Accounts bulk-created by the owner on 2026-10-11 got a predictable temporary password.
update public.members
   set must_change_password = true
 where auth_user_id is not null
   and system_role <> 'OWNER'
   and created_at >= timestamptz '2026-10-11 19:30:00+00';

create or replace function public.get_my_profile()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_member public.members; v_roles jsonb; v_games jsonb;
begin
  select * into v_member from public.members
   where auth_user_id = auth.uid() and is_active;
  if not found then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('event_id', er.event_id, 'role', er.role, 'team_id', er.team_id) order by er.event_id, er.role), '[]'::jsonb)
    into v_roles from public.event_roles er where er.member_id = v_member.id;
  select coalesce(jsonb_agg(jsonb_build_object('event_id', rg.event_id, 'game_id', rg.game_id) order by rg.event_id, rg.game_id), '[]'::jsonb)
    into v_games from public.referee_games rg where rg.member_id = v_member.id;
  return jsonb_build_object('id', v_member.id, 'username', v_member.username,
    'phone', v_member.phone, 'full_name_en', v_member.full_name_en,
    'full_name_ar', v_member.full_name_ar, 'system_role', v_member.system_role,
    'must_change_password', v_member.must_change_password,
    'roles', v_roles, 'assigned_games', v_games);
end $$;
