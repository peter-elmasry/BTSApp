import type { PublicMatch } from './public-types';
import { currencyLabel } from '../../features/standings/rank-motion';
import { costsLife, isLivesMode, lifeEmoji, teamLives } from './scoring';

const lives = { scoring_mode: 'LIVES' as const, initial_lives: 3, life_emoji: '💛' };
const match = (id: string, outcome: string, status = 'COMPLETED') =>
  ({
    id,
    round_id: 'r',
    game_id: 'g',
    status,
    participants: [
      { team_id: 'a', team_code: 'T01', side: 'A', outcome },
      { team_id: 'b', team_code: 'T02', side: 'B' },
    ],
  }) as PublicMatch;

describe('lives scoring (D038)', () => {
  it('only losses and forfeits cost a life', () => {
    expect(['WIN', 'DRAW', 'PENDING', undefined].map((o) => costsLife(o as never))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(costsLife('LOSS')).toBe(true);
    expect(costsLife('FORFEIT')).toBe(true);
  });

  it('mirrors the server: wins keep lives, losses cost one, floors at zero, bonuses add', () => {
    const matches = [match('1', 'WIN'), match('2', 'LOSS'), match('3', 'FORFEIT')];
    expect(teamLives(lives, matches, [], 'T01')).toBe(1);
    const many = [...matches, match('4', 'LOSS'), match('5', 'LOSS')];
    expect(teamLives(lives, many, [], 'T01')).toBe(0);
    expect(teamLives(lives, many, [{ points: 1, match_id: null }], 'T01')).toBe(1);
    expect(teamLives(lives, [match('6', 'LOSS', 'VOID')], [], 'T01')).toBe(3);
    expect(teamLives(lives, [match('7', 'LOSS', 'SCHEDULED')], [], 'T01')).toBe(3);
    expect(
      teamLives(lives, [match('8', 'LOSS', 'VOID')], [{ points: -1, match_id: '8' }], 'T01'),
    ).toBe(3);
    expect(teamLives({ scoring_mode: 'POINTS' }, matches, [], 'T01')).toBeNull();
  });

  it('labels totals with the life symbol in lives mode only', () => {
    const currency = {
      currency_en_one: 'Point',
      currency_en_other: 'Points',
      currency_ar_one: 'نقطة',
      currency_ar_two: 'نقطتين',
      currency_ar_plural: 'نقط',
    };
    expect(currencyLabel(2, { ...currency, ...lives }, 'en')).toBe('💛');
    expect(currencyLabel(2, { ...currency, ...lives }, 'ar')).toBe('💛');
    expect(currencyLabel(2, currency, 'en')).toBe('Points');
    expect(isLivesMode(null)).toBe(false);
    expect(lifeEmoji({ life_emoji: '  ' })).toBe('❤️');
  });
});
