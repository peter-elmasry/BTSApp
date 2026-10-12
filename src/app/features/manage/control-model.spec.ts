import { describe, expect, it } from 'vitest';
import { nextRoundAfter, plannedEnd, validOffset } from './control-model';

const round = (id: string, number: number, status: 'DRAFT' | 'ACTIVE' | 'CLOSED') => ({
  id,
  number,
  status,
  duration_min: 15,
  extension_min: 0,
});

describe('control model', () => {
  it('finds the next draft round after the current one', () => {
    const rounds = [
      round('a', 1, 'CLOSED'),
      round('b', 2, 'ACTIVE'),
      round('d', 4, 'DRAFT'),
      round('c', 3, 'DRAFT'),
    ];
    expect(nextRoundAfter(rounds, rounds[1])?.id).toBe('c');
    expect(nextRoundAfter(rounds, rounds[2])).toBeNull();
    expect(nextRoundAfter(rounds, undefined)).toBeNull();
  });
  it('computes the planned end of a backdated start', () => {
    const now = Date.parse('2026-10-13T10:00:00Z');
    expect(new Date(plannedEnd(round('a', 1, 'DRAFT'), now, 0)).toISOString()).toBe(
      '2026-10-13T10:15:00.000Z',
    );
    expect(new Date(plannedEnd(round('a', 1, 'DRAFT'), now, 20)).toISOString()).toBe(
      '2026-10-13T09:55:00.000Z',
    );
  });
  it('accepts whole minutes from 0 to 180', () => {
    expect(validOffset(0)).toBe(true);
    expect(validOffset(180)).toBe(true);
    expect(validOffset(181)).toBe(false);
    expect(validOffset(-1)).toBe(false);
    expect(validOffset(2.5)).toBe(false);
  });
});
