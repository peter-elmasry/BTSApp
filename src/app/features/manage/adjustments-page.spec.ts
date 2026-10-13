import { describe, expect, it } from 'vitest';
import type { LiveAdjustment } from '../../core/live/live-types';
import { filterAdjustments } from './adjustments-page';

const item = (id: string, scope: 'MATCH' | 'EVENT', team: string, at: string, revoked = false) =>
  ({
    id,
    scope,
    team_id: team,
    created_at: at,
    revoked_at: revoked ? at : null,
  }) as LiveAdjustment;

describe('adjustment filters', () => {
  const items = [
    item('a', 'MATCH', 't1', '2026-10-13T10:00:00Z'),
    item('b', 'EVENT', 't2', '2026-10-13T11:00:00Z'),
    item('c', 'EVENT', 't1', '2026-10-13T12:00:00Z', true),
  ];
  it('hides revoked rows by default and lists newest first', () => {
    expect(
      filterAdjustments(items, { scope: 'ALL', team: '', revoked: false }).map((x) => x.id),
    ).toEqual(['b', 'a']);
    expect(
      filterAdjustments(items, { scope: 'ALL', team: '', revoked: true }).map((x) => x.id),
    ).toEqual(['c', 'b', 'a']);
  });
  it('filters by scope and team', () => {
    expect(
      filterAdjustments(items, { scope: 'EVENT', team: '', revoked: true }).map((x) => x.id),
    ).toEqual(['c', 'b']);
    expect(
      filterAdjustments(items, { scope: 'ALL', team: 't1', revoked: false }).map((x) => x.id),
    ).toEqual(['a']);
  });
});
