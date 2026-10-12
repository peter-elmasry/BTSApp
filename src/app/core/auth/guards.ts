import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';
import { resolveLanding } from './landing';

export const PASSWORD_URL = '/account/password';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialize();
  if (!auth.session())
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  // A temporary (owner-set) password must be replaced before any staff screen opens.
  if (auth.profile()?.must_change_password && !state.url.startsWith(PASSWORD_URL))
    return router.createUrlTree([PASSWORD_URL]);
  return true;
};

export const guestOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const landing = resolveLanding();
  await auth.initialize();
  if (!auth.session()) return true;
  return router.parseUrl(await landing);
};

export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialize();
  return auth.profile()?.system_role === 'OWNER' ? true : router.createUrlTree(['/home']);
};

// Match IDs are resolved by the staff RPC, which enforces the exact event/game scope.
export const scoringGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialize();
  const profile = auth.profile();
  const allowed =
    profile?.system_role === 'OWNER' ||
    profile?.roles.some((role) => role.role === 'REFEREE' || role.role === 'EVENT_ADMIN');
  return allowed ? true : router.createUrlTree(['/home']);
};

export const eventRoleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialize();
  const profile = auth.profile();
  if (profile?.system_role === 'OWNER') return true;
  const eventId = route.paramMap.get('eventId');
  const required = route.data['roles'] as string[] | undefined;
  const matches = profile?.roles.some(
    (role) => role.event_id === eventId && required?.includes(role.role),
  );
  return matches ? true : router.createUrlTree(['/home']);
};
