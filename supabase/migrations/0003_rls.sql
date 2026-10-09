-- Deny ALL direct domain access. Public reference reads can be deliberately
-- introduced in later phases; results/member phones never gain blanket SELECT.
do $$
declare t text;
begin
  foreach t in array array['members','events','teams','games','rounds','matches','match_participants','event_roles','referee_games','adjustments','audit_log','client_ops','login_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;
grant usage, select on sequence public.audit_log_id_seq to service_role;

-- Supabase's default function grants are too broad for SECURITY DEFINER helpers.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
grant execute on function public.current_member_id(), public.is_owner(), public.is_event_admin(uuid), public.is_referee_for_match(uuid), public.is_staff(uuid), public.can_see_results(uuid), public.server_now() to anon, authenticated;
grant execute on all functions in schema public to service_role;

create index teams_event_id_idx on public.teams(event_id);
create index games_event_id_idx on public.games(event_id);
create index rounds_event_id_idx on public.rounds(event_id);
create index matches_event_id_idx on public.matches(event_id);
create index matches_round_id_idx on public.matches(round_id);
create index participants_team_id_idx on public.match_participants(team_id);
create index roles_event_id_idx on public.event_roles(event_id);
create index referee_games_event_id_idx on public.referee_games(event_id);
create index adjustments_event_id_idx on public.adjustments(event_id);
create index adjustments_team_id_idx on public.adjustments(team_id);
create index audit_event_time_idx on public.audit_log(event_id, at desc);
create index login_attempts_identifier_time_idx on public.login_attempts(identifier, attempted_at desc);
