import type { StaffProfile } from '../core/auth/auth.store';

export interface NavItem {
  key: string;
  icon: string;
  /** Router path; omitted for the More sheet. */
  path?: string;
  action?: 'more';
}

type NavProfile = Pick<StaffProfile, 'system_role' | 'roles'>;

export function isEventAdmin(profile: NavProfile | null, eventId: string | null): boolean {
  if (!profile || !eventId) return false;
  return (
    profile.system_role === 'OWNER' ||
    profile.roles.some((role) => role.event_id === eventId && role.role === 'EVENT_ADMIN')
  );
}

export function isEventReferee(profile: NavProfile | null, eventId: string | null): boolean {
  return (
    !!profile &&
    !!eventId &&
    profile.roles.some((role) => role.event_id === eventId && role.role === 'REFEREE')
  );
}

const MORE: NavItem = { key: 'nav.more', icon: '⋯', action: 'more' };

/** Role-aware bottom navigation, at most five items (UX plan §4.1). */
export function navigationFor(
  profile: NavProfile | null,
  eventId: string | null,
  canSeeStandings: boolean,
): NavItem[] {
  if (isEventAdmin(profile, eventId)) {
    const base = `/manage/${eventId}`;
    return [
      { key: 'nav.control', icon: '◎', path: `${base}/live` },
      { key: 'nav.results', icon: '☰', path: `${base}/results` },
      { key: 'nav.leaderboard', icon: '♜', path: `${base}/standings` },
      { key: 'nav.setup', icon: '⚙', path: `${base}/setup` },
      MORE,
    ];
  }
  const standings: NavItem[] = canSeeStandings
    ? [{ key: 'nav.leaderboard', icon: '♜', path: '/leaderboard' }]
    : [];
  if (isEventReferee(profile, eventId)) {
    return [
      { key: 'nav.myStation', icon: '⚑', path: '/ref' },
      { key: 'nav.schedule', icon: '▦', path: '/schedule' },
      ...standings,
      MORE,
    ];
  }
  const player: NavItem[] = [
    { key: 'nav.home', icon: '⌂', path: '/home' },
    { key: 'nav.schedule', icon: '▦', path: '/schedule' },
    ...standings,
  ];
  // Owners without a current event still need their account menu.
  return profile?.system_role === 'OWNER'
    ? [...player, MORE]
    : [...player, { key: 'nav.about', icon: '◉', path: '/about' }];
}
