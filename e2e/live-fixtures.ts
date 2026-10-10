import type { Page } from '@playwright/test';
import type { LiveSnapshot, MatchOutcome } from '../src/app/core/live/live-types';
import { bootstrap, event, eventId, matches } from './public-fixtures';

export async function mockLiveEvent(
  page: Page,
  options: {
    lang?: 'en' | 'ar';
    role?: 'REFEREE' | 'EVENT_ADMIN';
    opening?: boolean;
    overtime?: boolean;
  } = {},
) {
  const role = options.role ?? 'REFEREE';
  const lang = options.lang ?? 'en';
  await page.addInitScript(
    ({ lang, eventId }) => {
      localStorage.setItem('bts.lang', lang);
      localStorage.setItem(`bts.team.${eventId}`, 'T01');
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: { id: 'live-user', aud: 'authenticated', role: 'authenticated' },
        }),
      );
    },
    { lang, eventId },
  );
  const snapshot: LiveSnapshot = structuredClone({
    ...bootstrap,
    event: {
      ...event,
      match_bonus_cap: 3,
      match_penalty_cap: 2,
      event_bonus_cap: 4,
      event_penalty_cap: 4,
    },
    matches: matches.map((match) => ({
      ...match,
      result_entered_by: null,
      result_entered_at: null,
      participants: match.participants.map((p) => ({ ...p, outcome: 'PENDING' as const })),
    })),
    adjustments: [],
  });
  if (options.opening) {
    snapshot.rounds[0].type = 'OPENING';
    snapshot.rounds[0].number = 0;
    snapshot.matches[0].participants.forEach((p) => (p.side = null));
  }
  if (options.overtime) {
    snapshot.rounds[0].ends_at = new Date(Date.now() - 65000).toISOString();
    snapshot.rounds[0].is_overtime = true;
  }
  let networkFailure = false;
  let loseNextResponse = false;
  const calls: { name: string; args: Record<string, any> }[] = [];
  const applied = new Map<string, unknown>();
  const profile = {
    id: 'live-member',
    username: 'referee',
    full_name_en: 'Mina Referee',
    full_name_ar: 'مينا الحكم',
    phone: null,
    system_role: 'MEMBER',
    roles: [{ event_id: eventId, role, team_id: null }],
    assigned_games: [{ event_id: eventId, game_id: 'game-1' }],
  };
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    if (networkFailure) return route.abort('internetdisconnected');
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const args = route.request().postDataJSON() ?? {};
    let data: unknown = null;
    const fail = (message: string, details: unknown = {}) =>
      route.fulfill({
        status: 400,
        headers,
        json: { code: 'P0001', message, details: JSON.stringify(details) },
      });
    if (args.p_op_id) {
      calls.push({ name, args });
      if (applied.has(args.p_op_id)) data = applied.get(args.p_op_id);
      else {
        const round = snapshot.rounds.find((r) => r.id === args.p_round);
        const match = snapshot.matches.find((m) => m.id === args.p_match);
        if (
          name === 'close_round' &&
          snapshot.matches.some((m) => m.round_id === args.p_round && m.status === 'SCHEDULED')
        )
          return fail('PENDING_MATCHES', {
            match_ids: snapshot.matches
              .filter((m) => m.round_id === args.p_round && m.status === 'SCHEDULED')
              .map((m) => m.id),
          });
        if (name === 'start_round' && round) {
          round.status = 'ACTIVE';
          round.started_at = new Date().toISOString();
          round.ends_at = new Date(Date.now() + round.duration_min * 60000).toISOString();
        }
        if (name === 'extend_round' && round) {
          round.extension_min += args.p_minutes;
          round.ends_at = new Date(
            Date.parse(round.ends_at!) + args.p_minutes * 60000,
          ).toISOString();
        }
        if (name === 'close_round' && round) round.status = 'CLOSED';
        if (name === 'reopen_round' && round) round.status = 'ACTIVE';
        if (name === 'submit_match_result' && match) {
          match.status = 'COMPLETED';
          match.result_entered_by = profile.id;
          match.result_entered_at = new Date().toISOString();
          for (const p of match.participants)
            p.outcome = (args.p_outcomes as MatchOutcome[]).find(
              (o) => o.team_id === p.team_id,
            )!.outcome;
        }
        if (name === 'reset_match_result' && match) {
          match.status = 'SCHEDULED';
          match.participants.forEach((p) => (p.outcome = 'PENDING'));
        }
        if (name === 'void_match' && match) match.status = 'VOID';
        if (name === 'add_adjustment')
          snapshot.adjustments.push({
            id: `adj-${applied.size}`,
            scope: args.p_scope,
            match_id: args.p_match,
            team_id: args.p_team,
            points: args.p_points,
            reason: args.p_reason,
            given_by: {
              id: profile.id,
              name_en: profile.full_name_en,
              name_ar: profile.full_name_ar,
            },
            created_at: new Date().toISOString(),
            revoked_at: null,
            revoke_reason: null,
          });
        if (name === 'revoke_adjustment') {
          const adjustment = snapshot.adjustments.find((a) => a.id === args.p_adjustment)!;
          adjustment.revoked_at = new Date().toISOString();
          adjustment.revoke_reason = args.p_reason;
        }
        data = { id: args.p_match ?? args.p_round ?? args.p_adjustment, event_id: eventId };
        applied.set(args.p_op_id, data);
        if (loseNextResponse) {
          loseNextResponse = false;
          networkFailure = true;
          return route.abort('connectionreset');
        }
      }
    } else {
      if (name === 'get_my_profile') data = profile;
      if (name === 'server_now') data = new Date().toISOString();
      if (name === 'get_current_event') data = snapshot.event;
      if (name === 'get_bootstrap')
        data = { teams: snapshot.teams, games: snapshot.games, rounds: snapshot.rounds };
      if (name === 'get_schedule')
        data = snapshot.matches.map((m) => ({
          ...m,
          participants: m.participants.map(({ outcome, ...p }) => p),
        }));
      if (name === 'get_live_event') data = snapshot;
      if (name === 'get_referee_board')
        data = {
          ...snapshot,
          matches: snapshot.matches.filter((m) =>
            snapshot.rounds.some((r) => r.id === m.round_id && r.status === 'ACTIVE'),
          ),
        };
      if (name === 'get_match_entry')
        data = { ...snapshot, matches: snapshot.matches.filter((m) => m.id === args.p_match) };
      if (name === 'get_team_view')
        data = {
          team: snapshot.teams.find((t) => t.code === args.p_team_code),
          matches: snapshot.matches.map((m) => ({
            ...m,
            participants: m.participants.map((p) =>
              p.team_code === args.p_team_code ? p : (({ outcome, ...rest }) => rest)(p),
            ),
          })),
          adjustments: snapshot.adjustments.filter((a) => !a.revoked_at),
        };
    }
    await route.fulfill({ status: 200, headers, json: data });
  });
  return {
    snapshot,
    calls,
    applied,
    networkFailure: (value: boolean) => (networkFailure = value),
    loseNextResponse: () => (loseNextResponse = true),
  };
}
