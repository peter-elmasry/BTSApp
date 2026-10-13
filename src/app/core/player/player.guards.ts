import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventStore } from './event.store';
import { TeamSelectionStore } from './team-selection.store';
import { AuthStore } from '../auth/auth.store';
import { canSeeAllOutcomes } from './event.store';
import { ToastService } from '../../shared/ui/toast';
import { landingFor } from '../auth/landing';

/** Where staff who guide no team go instead of the team picker. */
function staffStart(auth: AuthStore, events: EventStore): string {
  const target = landingFor(auth.profile(), events.event()?.id ?? null);
  return target === '/home' ? '/schedule' : target;
}

export const teamChosenGuard: CanActivateFn = async (route) => {
  const events = inject(EventStore);
  const selection = inject(TeamSelectionStore);
  const router = inject(Router);
  const auth = inject(AuthStore);
  await auth.initialize();
  await events.initialize();
  if (!events.event()) return true;
  if (!selection.selectedCode() && selection.staffWithoutTeam())
    return router.parseUrl(staffStart(auth, events));
  const suggested = route.queryParamMap.get('team');
  if (suggested !== null)
    return router.createUrlTree(['/choose-team'], { queryParams: { team: suggested } });
  return selection.selectedCode() ? true : router.createUrlTree(['/choose-team']);
};

/** `/choose-team` is for players and guides only. */
export const chooseTeamGuard: CanActivateFn = async () => {
  const events = inject(EventStore);
  const selection = inject(TeamSelectionStore);
  const router = inject(Router);
  const auth = inject(AuthStore);
  await auth.initialize();
  await events.initialize();
  return selection.staffWithoutTeam() ? router.parseUrl(staffStart(auth, events)) : true;
};

export const leaderboardVisibleGuard: CanActivateFn = async () => {
  const events = inject(EventStore);
  const auth = inject(AuthStore);
  const router = inject(Router);
  const toast = inject(ToastService);
  await events.initialize();
  if (events.event() && canSeeAllOutcomes(events.event(), auth.profile())) return true;
  toast.show('leaderboard.hidden');
  return router.createUrlTree(['/home']);
};
