import { describe, expect, it } from 'vitest';
import type { LiveAdjustment } from '../../core/live/live-types';
import { remainingAllowance, validOutcomes } from './live-helpers';

describe('live result combinations', () => {
  const ids = ['a', 'b'];
  it('accepts the six regular combinations and rejects inconsistent outcomes', () => {
    for (const values of [
      ['WIN', 'LOSS'],
      ['LOSS', 'WIN'],
      ['DRAW', 'DRAW'],
      ['FORFEIT', 'WIN'],
      ['WIN', 'FORFEIT'],
      ['FORFEIT', 'FORFEIT'],
    ] as const)
      expect(
        validOutcomes(
          'REGULAR',
          ids,
          values.map((outcome, index) => ({ team_id: ids[index], outcome })),
        ),
      ).toBe(true);
    expect(
      validOutcomes('REGULAR', ids, [
        { team_id: 'a', outcome: 'WIN' },
        { team_id: 'b', outcome: 'WIN' },
      ]),
    ).toBe(false);
    expect(
      validOutcomes('REGULAR', ids, [
        { team_id: 'a', outcome: 'WIN' },
        { team_id: 'a', outcome: 'LOSS' },
      ]),
    ).toBe(false);
  });
  it('allows all opening winners or all forfeits, with at least one winner otherwise', () => {
    for (const outcome of ['WIN', 'FORFEIT'] as const)
      expect(
        validOutcomes(
          'OPENING',
          ids,
          ids.map((team_id) => ({ team_id, outcome })),
        ),
      ).toBe(true);
    expect(
      validOutcomes('OPENING', ids, [
        { team_id: 'a', outcome: 'LOSS' },
        { team_id: 'b', outcome: 'FORFEIT' },
      ]),
    ).toBe(false);
    expect(
      validOutcomes('OPENING', ids, [
        { team_id: 'a', outcome: 'WIN' },
        { team_id: 'b', outcome: 'DRAW' },
      ]),
    ).toBe(false);
  });
});
describe('remaining adjustment cap', () => {
  it('counts only non-revoked adjustments for the same team, scope, match and sign', () => {
    const base = { team_id: 'a', scope: 'MATCH', match_id: 'm', revoked_at: null };
    const adjustments = [
      { ...base, points: 3 },
      { ...base, points: 5, revoked_at: '2026-10-10' },
      { ...base, points: -2 },
      { ...base, points: 8, team_id: 'b' },
      { ...base, points: 8, match_id: 'other' },
      { ...base, points: 8, scope: 'EVENT' },
    ] as LiveAdjustment[];
    expect(remainingAllowance(10, adjustments, 'a', 'MATCH', 'm', true)).toBe(7);
    expect(remainingAllowance(4, adjustments, 'a', 'MATCH', 'm', false)).toBe(2);
    expect(remainingAllowance(null, adjustments, 'a', 'MATCH', 'm', true)).toBeNull();
    expect(remainingAllowance(0, [], 'a', 'EVENT', null, true)).toBe(0);
  });
});
