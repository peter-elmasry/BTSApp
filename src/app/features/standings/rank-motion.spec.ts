import { describe, expect, it } from 'vitest';
import type { PublicEvent, PublicMatch } from '../../core/player/public-types';
import type { StandingRow } from '../../core/standings/standings-types';
import { currencyLabel, interpolateTotal, latestVisibleResults, rankChanges } from './rank-motion';
import { nextDisplayView } from './display-page';

const row = (id: string, rank: number) => ({ team: { id }, rank }) as StandingRow;
const currency = {
  currency_en_one: 'Point',
  currency_en_other: 'Points',
  currency_ar_one: 'نقطة',
  currency_ar_two: 'نقطتين',
  currency_ar_plural: 'نقط',
} as PublicEvent;
const match = (id: string, time: string, round = 'round') =>
  ({
    id,
    round_id: round,
    status: 'COMPLETED',
    result_entered_at: time,
    participants: [{ team_id: id, team_code: id, outcome: 'WIN' }],
  }) as PublicMatch;

describe('standings presentation', () => {
  it('compares server ranks rather than list positions, preserving shared ties', () => {
    const changes = rankChanges(
      [row('a', 1), row('b', 1), row('c', 3)],
      [row('c', 1), row('a', 2), row('b', 2), row('new', 4)],
    );
    expect([...changes]).toEqual([
      ['c', 2],
      ['a', -1],
      ['b', -1],
      ['new', 0],
    ]);
  });
  it('uses the configured currency and Arabic categories for absolute positive or negative values', () => {
    expect([0, 1, 2, 5, 11, 100, -2, -5].map((n) => currencyLabel(n, currency, 'ar'))).toEqual([
      'نقطة',
      'نقطة',
      'نقطتين',
      'نقط',
      'نقطة',
      'نقطة',
      'نقطتين',
      'نقط',
    ]);
    expect([1, -1, 0, 2].map((n) => currencyLabel(n, currency, 'en'))).toEqual([
      'Point',
      'Point',
      'Points',
      'Points',
    ]);
  });
  it('clamps the countup including decreasing and negative totals', () => {
    expect(interpolateTotal(10, -5, -1)).toBe(10);
    expect(interpolateTotal(10, -5, 0.5)).toBe(-3);
    expect(interpolateTotal(10, -5, 2)).toBe(-5);
  });
  it('uses the latest result time, including corrections to earlier rounds, and limits to five', () => {
    const matches = Array.from({ length: 7 }, (_, i) =>
      match(String(i), `2026-10-10T12:0${i}:00Z`),
    );
    matches.push(match('corrected-old-round', '2026-10-10T13:00:00Z', 'old'));
    expect(latestVisibleResults(matches, []).map((item) => item.id)).toEqual([
      'corrected-old-round',
      '6',
      '5',
      '4',
      '3',
    ]);
  });
  it('never includes void, pending or redacted cached outcomes in the display ticker', () => {
    const visible = match('visible', '2026-10-10T12:00:00Z');
    const voided = { ...visible, id: 'void', status: 'VOID' as const };
    const redacted = {
      ...visible,
      id: 'hidden',
      participants: [{ team_id: 'a', team_code: 'A', side: null }],
    };
    const pending = {
      ...visible,
      id: 'pending',
      participants: [{ team_id: 'a', team_code: 'A', side: null, outcome: 'PENDING' as const }],
    };
    expect(latestVisibleResults([visible, voided, redacted, pending], [])).toEqual([visible]);
  });
  it('cycles back to standings and stays there until there are visible results', () => {
    expect(nextDisplayView('standings', true)).toBe('results');
    expect(nextDisplayView('results', true)).toBe('standings');
    expect(nextDisplayView('standings', false)).toBe('standings');
  });
});
