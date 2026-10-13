import { computed, inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import { CanActivateFn, GuardResult, Router } from '@angular/router';
import { AuthStore } from '../auth/auth.store';
import { EventStore } from './event.store';
import { teamChosenGuard } from './player.guards';
import { TeamSelectionStore } from './team-selection.store';

/**
 * What a viewer may open (D046). Signed-in DST members see every team and game; a
 * visitor without a login sees only details of the team chosen on this device.
 * Players are anonymous, so this is a screen rule like the team lock (D035), not a
 * database boundary: the database cannot know which team a device picked.
 */
@Injectable({ providedIn: 'root' })
export class ViewerScope {
  private readonly auth = inject(AuthStore);
  private readonly selection = inject(TeamSelectionStore);
  readonly member = computed(() => !!this.auth.session());
  canOpenTeam(code: string | null | undefined): boolean {
    return this.member() || (!!code && code === this.selection.selectedCode());
  }
  canOpenGames(): boolean {
    return this.member();
  }
}

/** `/teams/:code`: members see any team; visitors only their own. */
export const teamPageGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const events = inject(EventStore);
  const selection = inject(TeamSelectionStore);
  const router = inject(Router);
  await auth.initialize();
  if (auth.session()) return true;
  await events.initialize();
  const code = route.paramMap.get('code')?.trim().toUpperCase();
  return code && code === selection.selectedCode() ? true : router.parseUrl('/home');
};

/** `/schedule`: staff see the whole schedule without a team; visitors pick one first. */
export const scheduleGuard: CanActivateFn = async (route, state) => {
  const injector = inject(Injector);
  const auth = inject(AuthStore);
  await auth.initialize();
  if (auth.session() && route.queryParamMap.get('team') === null) return true;
  // The team guard injects its services, so run it back inside the route's injection context.
  return (await runInInjectionContext(injector, () =>
    teamChosenGuard(route, state),
  )) as GuardResult;
};

/** `/games/:code`: DST members only (D046). */
export const memberOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.initialize();
  return auth.session() ? true : router.parseUrl('/home');
};
