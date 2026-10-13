import { describe, expect, it } from 'vitest';
import { landingFor } from './landing';

const member = (roles: { role: 'EVENT_ADMIN' | 'REFEREE' | 'GUIDE'; event_id: string }[]) => ({
  system_role: 'MEMBER' as const,
  roles: roles.map((role) => ({ ...role, team_id: role.role === 'GUIDE' ? 't1' : null })),
});

describe('role landing pages', () => {
  it('sends anonymous visitors and guides to the player home', () => {
    expect(landingFor(null, 'e1')).toBe('/home');
    expect(landingFor(member([{ role: 'GUIDE', event_id: 'e1' }]), 'e1')).toBe('/home');
  });
  it('sends owners to the current event control screen or the events list', () => {
    expect(landingFor({ system_role: 'OWNER', roles: [] }, 'e1')).toBe('/manage/e1/live');
    expect(landingFor({ system_role: 'OWNER', roles: [] }, null)).toBe('/owner/events');
  });
  it('prefers event administration over refereeing in the current event only', () => {
    const both = member([
      { role: 'REFEREE', event_id: 'e1' },
      { role: 'EVENT_ADMIN', event_id: 'e1' },
    ]);
    expect(landingFor(both, 'e1')).toBe('/manage/e1/live');
    expect(landingFor(member([{ role: 'REFEREE', event_id: 'e1' }]), 'e1')).toBe('/ref');
    expect(landingFor(member([{ role: 'EVENT_ADMIN', event_id: 'old' }]), 'e1')).toBe('/home');
    expect(landingFor(member([{ role: 'REFEREE', event_id: 'e1' }]), null)).toBe('/home');
  });
});
