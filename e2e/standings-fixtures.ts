import type { Page } from '@playwright/test';
import type { StandingRow, StandingsExport } from '../src/app/core/standings/standings-types';
import { mockLiveEvent } from './live-fixtures';
import { eventId } from './public-fixtures';

export async function mockStandingsEvent(
  page: Page,
  options: {
    lang?: 'en' | 'ar';
    role?: 'PLAYER' | 'REFEREE' | 'EVENT_ADMIN';
    public?: boolean;
  } = {},
) {
  const role = options.role ?? 'PLAYER';
  const fixture = await mockLiveEvent(page, {
    lang: options.lang,
    role: role === 'EVENT_ADMIN' ? role : 'REFEREE',
  });
  if (role === 'PLAYER')
    await page.addInitScript(() => localStorage.removeItem('sb-127-auth-token'));
  fixture.snapshot.event.leaderboard_public = options.public ?? true;
  const rows: StandingRow[] = fixture.snapshot.teams.map((team) => ({
    rank: 1,
    team,
    played: 1,
    wins: 0,
    draws: 1,
    losses: 0,
    forfeits: 0,
    match_points: 1,
    adjustment_points: 0,
    total: 1,
    is_tied: true,
    final_tiebreak_pos: null,
  }));
  fixture.snapshot.matches[0].status = 'COMPLETED';
  fixture.snapshot.matches[0].result_entered_at = '2026-10-10T12:00:00Z';
  fixture.snapshot.matches[0].participants.forEach((participant) => (participant.outcome = 'DRAW'));
  const exportData: StandingsExport = {
    event: fixture.snapshot.event,
    generated_at: '2026-10-10T12:01:00Z',
    standings: rows,
    matches: fixture.snapshot.matches.map((match) => ({
      id: match.id,
      round_number: fixture.snapshot.rounds.find((round) => round.id === match.round_id)!.number,
      round_type: 'REGULAR',
      game_code: 'G01',
      game_name_en: 'Relay',
      game_name_ar: 'التتابع',
      status: match.status,
      participants: match.participants.map((participant) => ({
        team_code: participant.team_code,
        name_en: rows.find((row) => row.team.id === participant.team_id)!.team.name_en,
        name_ar: rows.find((row) => row.team.id === participant.team_id)!.team.name_ar,
        outcome: participant.outcome!,
      })),
      entered_by: { name_en: 'Mina Referee', name_ar: 'مينا الحكم' },
      result_entered_at: match.result_entered_at,
    })),
    adjustments: [],
    staff: [
      {
        member_id: 'live-member',
        username: 'referee',
        name_en: 'Mina Referee',
        name_ar: 'مينا الحكم',
        role: 'REFEREE',
        game_codes: ['G01'],
        team_code: null,
      },
    ],
  };
  let blocked = false;
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/**', async (route) => {
    if (blocked) return route.abort('internetdisconnected');
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (
      ![
        'get_standings',
        'get_export_data',
        'set_tiebreak',
        'set_leaderboard_visibility',
        'get_schedule',
        'get_team_view',
        'get_event_setup',
      ].includes(name)
    )
      return route.fallback();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const args = route.request().postDataJSON() ?? {};
    const allowed = fixture.snapshot.event.leaderboard_public || role === 'EVENT_ADMIN';
    let data: unknown = null;
    if (
      ['get_export_data', 'set_tiebreak', 'set_leaderboard_visibility'].includes(name) &&
      role !== 'EVENT_ADMIN'
    )
      return route.fulfill({ status: 400, headers, json: { code: 'P0001', message: 'FORBIDDEN' } });
    if (name === 'get_standings' && !allowed)
      return route.fulfill({
        status: 400,
        headers,
        json: { code: 'P0001', message: 'LEADERBOARD_HIDDEN' },
      });
    if (name === 'get_standings') data = rows;
    if (name === 'get_export_data') data = exportData;
    if (name === 'get_event_setup')
      data = {
        ...fixture.snapshot,
        roles: [{ member_id: 'live-member', role: 'REFEREE', team_id: null }],
        referee_games: [],
        eligible_members: [
          {
            id: 'live-member',
            username: 'referee',
            full_name_en: 'Mina Referee',
            full_name_ar: 'مينا الحكم',
          },
        ],
      };
    if (name === 'get_team_view')
      data = {
        team: fixture.snapshot.teams.find((team) => team.code === args.p_team_code),
        standing: allowed ? rows.find((row) => row.team.code === args.p_team_code) : null,
        matches: fixture.snapshot.matches.map((match) => ({
          ...match,
          participants: match.participants.map((participant) => {
            if (allowed || participant.team_code === args.p_team_code) return participant;
            const { outcome, ...redacted } = participant;
            return redacted;
          }),
        })),
        adjustments: fixture.snapshot.adjustments.filter(
          (item) =>
            !item.revoked_at &&
            fixture.snapshot.teams.find((team) => team.code === args.p_team_code)?.id ===
              item.team_id,
        ),
      };
    if (name === 'get_schedule')
      data = fixture.snapshot.matches.map((match) => {
        if (allowed) return match;
        const { result_entered_at, ...redacted } = match;
        return {
          ...redacted,
          participants: match.participants.map(({ outcome, ...participant }) => participant),
        };
      });
    if (args.p_op_id) {
      fixture.calls.push({ name, args });
      if (fixture.applied.has(args.p_op_id)) data = fixture.applied.get(args.p_op_id);
      else {
        if (name === 'set_leaderboard_visibility')
          fixture.snapshot.event.leaderboard_public = args.p_public;
        if (name === 'set_tiebreak') {
          for (const row of rows) {
            row.final_tiebreak_pos = args.p_team_ids.indexOf(row.team.id) + 1;
            row.rank = row.final_tiebreak_pos;
            row.is_tied = false;
          }
          rows.sort((a, b) => a.rank - b.rank);
        }
        data = { event_id: eventId };
        fixture.applied.set(args.p_op_id, data);
      }
    }
    return route.fulfill({ status: 200, headers, json: data });
  });
  return {
    ...fixture,
    rows,
    exportData,
    networkFailure: (value: boolean) => {
      blocked = value;
      fixture.networkFailure(value);
    },
  };
}
