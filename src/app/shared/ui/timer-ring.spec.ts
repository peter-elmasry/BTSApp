import { describe, expect, it } from 'vitest';
import { formatClock, ringProgress } from './timer-ring';

const round = (endsAt: string, status: 'ACTIVE' | 'DRAFT' | 'CLOSED' = 'ACTIVE') => ({
  status,
  duration_min: 10,
  extension_min: 0,
  ends_at: endsAt,
});

describe('timer ring', () => {
  const end = Date.parse('2026-10-13T10:10:00Z');
  it('depletes from 1 to 0 across the round', () => {
    expect(ringProgress(round('2026-10-13T10:10:00Z'), end - 10 * 60_000)).toBe(1);
    expect(ringProgress(round('2026-10-13T10:10:00Z'), end - 5 * 60_000)).toBe(0.5);
    expect(ringProgress(round('2026-10-13T10:10:00Z'), end + 60_000)).toBe(0);
  });
  it('is null when the round is not running', () => {
    expect(ringProgress(round('2026-10-13T10:10:00Z', 'DRAFT'), end)).toBeNull();
    expect(ringProgress(null, end)).toBeNull();
  });
  it('formats countdown and overtime', () => {
    expect(formatClock(125, false)).toBe('02:05');
    expect(formatClock(61, true)).toBe('+01:01');
  });
});
