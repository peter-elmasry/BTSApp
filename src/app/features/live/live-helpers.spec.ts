import { describe, expect, it } from 'vitest';
import type { StaffProfile } from '../../core/auth/auth.store';
import type { LiveAdjustment, LiveMatch, LiveSnapshot } from '../../core/live/live-types';
import {
  canEditLiveMatch,
  canManageAdjustment,
  remainingAllowance,
  validOutcomes,
  validAdjustmentAmount,
} from './live-helpers';

describe('existing adjustment permissions', () => {
  const item = { given_by: { id: 'issuer' }, revoked_at: null } as LiveAdjustment;
  const member = (
    id: string,
    roles: StaffProfile['roles'] = [],
    system_role: StaffProfile['system_role'] = 'MEMBER',
  ) => ({ id, roles, system_role }) as StaffProfile;
  it('allows only owner, same-event admin, or issuer even after a round ends', () => {
    expect(canManageAdjustment(null, 'event', item)).toBe(false);
    expect(canManageAdjustment(member('issuer'), 'event', item)).toBe(true);
    expect(canManageAdjustment(member('owner', [], 'OWNER'), 'event', item)).toBe(true);
    expect(
      canManageAdjustment(
        member('admin', [{ event_id: 'event', role: 'EVENT_ADMIN', team_id: null }]),
        'event',
        item,
      ),
    ).toBe(true);
    expect(
      canManageAdjustment(
        member('other', [{ event_id: 'other-event', role: 'EVENT_ADMIN', team_id: null }]),
        'event',
        item,
      ),
    ).toBe(false);
    expect(
      canManageAdjustment(
        member('other', [{ event_id: 'event', role: 'REFEREE', team_id: null }]),
        'event',
        item,
      ),
    ).toBe(false);
    expect(
      canManageAdjustment(member('issuer'), 'event', { ...item, revoked_at: '2026-10-17' }),
    ).toBe(false);
  });
});

describe('decimal adjustment amounts', () => {
  it('accepts signed hundredths, quarters, halves and old integer submissions', () => {
    for (const amount of [0.25, 0.5, -0.25, -0.5, 0.01, 1.23, 1, -2, 2147483647]) {
      expect(validAdjustmentAmount(amount)).toBe(true);
    }
  });
  it('rejects zero, extra decimals, nonfinite and out-of-range amounts', () => {
    for (const amount of [0, -0, 0.001, 0.251, NaN, Infinity, -Infinity, 2147483648]) {
      expect(validAdjustmentAmount(amount)).toBe(false);
    }
  });
  it('uses exact hundredths when consuming or restoring caps', () => {
    const adjustments = [0.1, 0.2, 0.25, -0.5].map((points) => ({
      team_id: 'a',
      scope: 'MATCH',
      match_id: 'm',
      revoked_at: null,
      points,
    })) as LiveAdjustment[];
    expect(remainingAllowance(1, adjustments, 'a', 'MATCH', 'm', true)).toBe(0.45);
    expect(remainingAllowance(1, adjustments, 'a', 'MATCH', 'm', false)).toBe(0.5);
    adjustments[2].revoked_at = '2026-10-17';
    expect(remainingAllowance(1, adjustments, 'a', 'MATCH', 'm', true)).toBe(0.7);
  });
});

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

describe('referee editing window (D041)', () => {
  const referee = {
    system_role: 'MEMBER',
    roles: [{ event_id: 'e', role: 'REFEREE', team_id: null }],
    assigned_games: [{ event_id: 'e', game_id: 'g' }],
  } as unknown as StaffProfile;
  const snapshot = (status: 'DRAFT' | 'ACTIVE' | 'CLOSED') =>
    ({ event: { id: 'e' }, rounds: [{ id: 'r', status }] }) as unknown as LiveSnapshot;
  const match = (status: LiveMatch['status'], game = 'g') =>
    ({ id: 'm', round_id: 'r', game_id: game, status }) as LiveMatch;
  it('allows the active round and the first result of a late match only', () => {
    expect(canEditLiveMatch(snapshot('ACTIVE'), match('COMPLETED'), referee)).toBe(true);
    expect(canEditLiveMatch(snapshot('CLOSED'), match('SCHEDULED'), referee)).toBe(true);
    expect(canEditLiveMatch(snapshot('CLOSED'), match('COMPLETED'), referee)).toBe(false);
    expect(canEditLiveMatch(snapshot('DRAFT'), match('SCHEDULED'), referee)).toBe(false);
    expect(canEditLiveMatch(snapshot('CLOSED'), match('SCHEDULED', 'other'), referee)).toBe(false);
  });
});
