import type { PublicGame, PublicMatch, PublicRound } from '../../core/player/public-types';
import { groupByGame, groupByRound, teamRows } from './schedule-model';

const round = (id: string, number: number, type: 'REGULAR' | 'OPENING' = 'REGULAR') =>
  ({ id, number, type }) as PublicRound;
const game = (id: string) => ({ id, code: id.toUpperCase() }) as PublicGame;
const match = (id: string, round_id: string, game_id: string, codes: string[]) =>
  ({
    id,
    round_id,
    game_id,
    status: 'SCHEDULED',
    participants: codes.map((code) => ({ team_id: code, team_code: code, side: null })),
  }) as PublicMatch;

describe('schedule breaks (no match = break)', () => {
  const rounds = [round('r2', 2), round('r0', 0, 'OPENING'), round('r1', 1)];
  const games = [game('g1'), game('g2')];
  const matches = [
    match('m0', 'r0', 'g1', ['T01', 'T02', 'T03']),
    match('m1', 'r1', 'g1', ['T01', 'T02']),
    match('m2', 'r2', 'g2', ['T01', 'T03']),
  ];

  it('lists every game in each regular round with breaks, and only the opening match', () => {
    const groups = groupByRound(rounds, games, matches);
    expect(groups.map((group) => group.id)).toEqual(['r0', 'r1', 'r2']);
    expect(groups[0].rows.map((row) => row.match?.id)).toEqual(['m0']);
    expect(groups[1].rows.map((row) => [row.game?.id, row.match?.id ?? 'BREAK'])).toEqual([
      ['g1', 'm1'],
      ['g2', 'BREAK'],
    ]);
    expect(groups[2].rows.map((row) => row.match?.id ?? 'BREAK')).toEqual(['BREAK', 'm2']);
  });

  it('shows a game break in each round it is unused, ignoring unused opening stations', () => {
    const [g1, g2] = groupByGame(rounds, games, matches);
    expect(g1.rows.map((row) => [row.round.id, row.match?.id ?? 'BREAK'])).toEqual([
      ['r0', 'm0'],
      ['r1', 'm1'],
      ['r2', 'BREAK'],
    ]);
    expect(g2.rows.map((row) => [row.round.id, row.match?.id ?? 'BREAK'])).toEqual([
      ['r1', 'BREAK'],
      ['r2', 'm2'],
    ]);
  });

  it('gives a team one break row in each regular round where it has no match', () => {
    expect(teamRows(rounds, games, matches, 'T02').map((row) => row.match?.id ?? 'BREAK')).toEqual([
      'm0',
      'm1',
      'BREAK',
    ]);
    expect(teamRows(rounds, games, matches, 'T02')[2].game).toBeNull();
    expect(teamRows(rounds, games, matches, null)).toEqual([]);
  });
});
