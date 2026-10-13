import { describe, expect, it } from 'vitest';
import { liveMatchStatus, sortForChase } from './results-page';

describe('staff match status and chase order', () => {
  it('derives late from an ended round with no result', () => {
    expect(liveMatchStatus({ status: 'SCHEDULED' }, 'CLOSED')).toBe('late');
    expect(liveMatchStatus({ status: 'SCHEDULED' }, 'ACTIVE')).toBe('pending');
    expect(liveMatchStatus({ status: 'SCHEDULED' }, 'DRAFT')).toBe('scheduled');
    expect(liveMatchStatus({ status: 'COMPLETED' }, 'CLOSED')).toBe('done');
    expect(liveMatchStatus({ status: 'VOID' }, 'ACTIVE')).toBe('void');
  });
  it('puts late, then pending, then done, then void first to last', () => {
    const rows = [
      { id: 'void', status: 'VOID' as const },
      { id: 'done', status: 'COMPLETED' as const },
      { id: 'late', status: 'SCHEDULED' as const, closed: true },
      { id: 'pending', status: 'SCHEDULED' as const },
    ];
    const sorted = sortForChase(
      rows,
      (row) => liveMatchStatus(row, 'closed' in row ? 'CLOSED' : 'ACTIVE'),
      (row) => row.id,
    );
    expect(sorted.map((row) => row.id)).toEqual(['late', 'pending', 'done', 'void']);
  });
});
