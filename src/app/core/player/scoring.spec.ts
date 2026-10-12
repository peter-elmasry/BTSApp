import { currencyLabel } from '../../features/standings/rank-motion';
import { costsLife, isLivesMode, lifeEmoji, livesLeft } from './scoring';

const lives = { scoring_mode: 'LIVES' as const, initial_lives: 3, life_emoji: '💛' };
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

  it('reads lives left from the server breakdown only in lives mode', () => {
    const breakdown = {
      initial_lives: 3,
      match_points: 1,
      adjustment_points: 0,
      total: 1,
      lives_lost: 2,
    };
    expect(livesLeft({ breakdown: { ...breakdown, scoring_mode: 'LIVES' } })).toBe(1);
    expect(livesLeft({ breakdown: { ...breakdown, scoring_mode: 'POINTS' } })).toBeNull();
    expect(livesLeft(null)).toBeNull();
    expect(livesLeft({})).toBeNull();
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
