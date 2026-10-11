import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventStore } from './event.store';
import { TeamSelectionStore } from './team-selection.store';
import { AuthStore } from '../auth/auth.store';
import { canSeeAllOutcomes } from './event.store';
import { ToastService } from '../../shared/ui/toast';

export const teamChosenGuard: CanActivateFn = async (route) => {
  const events = inject(EventStore);
  const selection = inject(TeamSelectionStore);
  const router = inject(Router);
  await events.initialize();
  if (!events.event()) return true;
  const suggested = route.queryParamMap.get('team');
  if (suggested !== null)
    return router.createUrlTree(['/choose-team'], { queryParams: { team: suggested } });
  return selection.selectedCode() ? true : router.createUrlTree(['/choose-team']);
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
