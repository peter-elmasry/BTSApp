import { describe, expect, it } from 'vitest';
import { navigationFor } from './navigation';

const keys = (items: { key: string }[]) => items.map((item) => item.key);
const member = (role: 'EVENT_ADMIN' | 'REFEREE' | 'GUIDE', eventId = 'e1') => ({
  system_role: 'MEMBER' as const,
  roles: [{ event_id: eventId, role, team_id: null }],
});

describe('role-aware bottom navigation', () => {
  it('gives players and guides home, schedule, visible standings and about', () => {
    expect(keys(navigationFor(null, 'e1', false))).toEqual([
      'nav.home',
      'nav.schedule',
      'nav.about',
    ]);
    expect(keys(navigationFor(member('GUIDE'), 'e1', true))).toEqual([
      'nav.home',
      'nav.schedule',
      'nav.leaderboard',
      'nav.about',
    ]);
  });
  it('gives referees their station first and a More menu', () => {
    const items = navigationFor(member('REFEREE'), 'e1', false);
    expect(keys(items)).toEqual(['nav.myStation', 'nav.schedule', 'nav.more']);
    expect(items[0].path).toBe('/ref');
  });
  it('gives event admins and owners the five admin items', () => {
    for (const profile of [member('EVENT_ADMIN'), { system_role: 'OWNER' as const, roles: [] }]) {
      const items = navigationFor(profile, 'e1', true);
      expect(keys(items)).toEqual([
        'nav.control',
        'nav.results',
        'nav.leaderboard',
        'nav.setup',
        'nav.more',
      ]);
      expect(items[0].path).toBe('/manage/e1/live');
      expect(items.length).toBeLessThanOrEqual(5);
    }
  });
  it('ignores roles from other events', () => {
    expect(keys(navigationFor(member('EVENT_ADMIN', 'old'), 'e1', false))[0]).toBe('nav.home');
    expect(keys(navigationFor({ system_role: 'OWNER', roles: [] }, null, false))).toContain(
      'nav.more',
    );
  });
});
