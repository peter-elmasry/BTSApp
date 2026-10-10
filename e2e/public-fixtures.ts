import type { Page } from '@playwright/test';
import type {
  PublicBootstrap,
  PublicEvent,
  PublicMatch,
} from '../src/app/core/player/public-types';

export const eventId = '44000000-0000-0000-0000-000000000001';
export const event: PublicEvent = {
  id: eventId,
  code: 'PLAY',
  name_en: 'One team. One spirit.',
  name_ar: 'فريق واحد. روح واحدة.',
  status: 'LIVE',
  starts_on: null,
  leaderboard_public: false,
  show_guide_phone: false,
  points_win: 2,
  points_draw: 1,
  points_loss: 0,
  currency_en_one: 'Point',
  currency_en_other: 'Points',
  currency_ar_one: 'نقطة',
  currency_ar_two: 'نقطتين',
  currency_ar_plural: 'نقط',
};
export const bootstrap: PublicBootstrap = {
  teams: [
    {
      id: 'team-1',
      code: 'T01',
      name_en: 'Falcons',
      name_ar: 'الصقور',
      avatar_key: 'falcon',
      color_hex: '#087F8C',
      sort_order: 1,
      guide: { name_en: 'Mina', name_ar: 'مينا' },
    },
    {
      id: 'team-2',
      code: 'T02',
      name_en: 'Stars',
      name_ar: 'النجوم',
      avatar_key: 'star',
      color_hex: '#172B4D',
      sort_order: 2,
      guide: null,
    },
  ],
  games: [
    {
      id: 'game-1',
      code: 'G01',
      name_en: 'Relay',
      name_ar: 'التتابع',
      location_en: 'Main court',
      location_ar: 'الملعب الرئيسي',
      image_path: null,
    },
  ],
  rounds: [
    {
      id: 'round-1',
      number: 1,
      type: 'REGULAR',
      name_en: null,
      name_ar: null,
      duration_min: 15,
      extension_min: 0,
      status: 'ACTIVE',
      started_at: new Date(Date.now() - 60000).toISOString(),
      closed_at: null,
      ends_at: new Date(Date.now() + 14 * 60000).toISOString(),
      is_overtime: false,
    },
    {
      id: 'round-2',
      number: 2,
      type: 'REGULAR',
      name_en: null,
      name_ar: null,
      duration_min: 15,
      extension_min: 0,
      status: 'DRAFT',
      started_at: null,
      closed_at: null,
      ends_at: null,
      is_overtime: false,
    },
  ],
};
export const matches: PublicMatch[] = [
  {
    id: 'match-1',
    round_id: 'round-1',
    game_id: 'game-1',
    status: 'SCHEDULED',
    participants: [
      { team_id: 'team-1', team_code: 'T01', side: 'A' },
      { team_id: 'team-2', team_code: 'T02', side: 'B' },
    ],
  },
  {
    id: 'match-2',
    round_id: 'round-2',
    game_id: 'game-1',
    status: 'SCHEDULED',
    participants: [
      { team_id: 'team-1', team_code: 'T01', side: 'B' },
      { team_id: 'team-2', team_code: 'T02', side: 'A' },
    ],
  },
];

export async function mockPublicEvent(
  page: Page,
  options: { noEvent?: boolean; overtime?: boolean } = {},
) {
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const rpc = new URL(route.request().url()).pathname.split('/').at(-1);
    let data: unknown = null;
    if (rpc === 'get_current_event') data = options.noEvent ? null : event;
    if (rpc === 'get_bootstrap')
      data = options.overtime
        ? {
            ...bootstrap,
            rounds: bootstrap.rounds.map((r) =>
              r.status === 'ACTIVE'
                ? { ...r, ends_at: new Date(Date.now() - 65000).toISOString(), is_overtime: true }
                : r,
            ),
          }
        : bootstrap;
    if (rpc === 'get_schedule') data = matches;
    if (rpc === 'server_now') data = new Date().toISOString();
    if (rpc === 'get_team_view') {
      const code = route.request().postDataJSON().p_team_code;
      const team = bootstrap.teams.find((team) => team.code === code);
      if (!team)
        return route.fulfill({
          status: 400,
          headers,
          json: { code: 'P0001', message: 'NOT_FOUND' },
        });
      data = {
        team,
        matches: matches.map((m) => ({
          ...m,
          participants: m.participants.map((p) =>
            p.team_code === code ? { ...p, outcome: 'PENDING' } : p,
          ),
        })),
        adjustments: [],
      };
    }
    await route.fulfill({ status: 200, headers, json: data });
  });
}
