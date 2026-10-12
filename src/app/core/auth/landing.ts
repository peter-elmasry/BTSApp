import { inject, Injector } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventStore } from '../player/event.store';
import { AuthStore, type StaffProfile } from './auth.store';

type LandingProfile = Pick<StaffProfile, 'system_role' | 'roles'>;

/** Each role's start page for the current event (UX plan §2.1). */
export function landingFor(profile: LandingProfile | null, eventId: string | null): string {
  if (!profile) return '/home';
  const holds = (role: 'EVENT_ADMIN' | 'REFEREE') =>
    !!eventId && profile.roles.some((item) => item.event_id === eventId && item.role === role);
  if (profile.system_role === 'OWNER') return eventId ? `/manage/${eventId}/live` : '/owner/events';
  if (holds('EVENT_ADMIN')) return `/manage/${eventId}/live`;
  if (holds('REFEREE')) return '/ref';
  return '/home';
}

/**
 * Resolves the signed-in member's landing page once the session and current event are known.
 * Call it synchronously from an injection context; it reads the event store only for staff.
 */
export function resolveLanding(): Promise<string> {
  const auth = inject(AuthStore);
  const injector = inject(Injector);
  return (async () => {
    await auth.initialize();
    if (!auth.session() || !auth.profile()) return '/home';
    const events = injector.get(EventStore);
    await events.initialize();
    return landingFor(auth.profile(), events.event()?.id ?? null);
  })();
}

/** `/` sends signed-in staff to their start page; players continue to the team flow. */
export const landingGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const target = await resolveLanding();
  return target === '/home' ? true : router.parseUrl(target);
};
