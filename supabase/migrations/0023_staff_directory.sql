-- Quick look (D055): any signed-in, active DST member sees every team's Guides and
-- every game's Referees with their mobile numbers (D048). Visitors keep the public
-- names only (D036) and guide phones governed by show_guide_phone.
create function public.get_staff_directory(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ begin
  if public.current_member_id() is null then perform public.phase2_fail('FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event) then perform public.phase2_fail('NOT_FOUND'); end if;
  return jsonb_build_object(
    'team_guides',public.ux_team_guides_json(p_event),
    'game_referees',public.ux_game_referees_json(p_event));
end $$;
revoke execute on function public.get_staff_directory(uuid) from public,anon;
grant execute on function public.get_staff_directory(uuid) to authenticated,service_role;
