import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { DsAvatar } from '../../shared/ui/avatar';
import { currencyLabel } from '../standings/rank-motion';
import { CountUp } from '../../shared/ui/count-up';
import { guideNames, localizedName, teamGuides } from './public-helpers';
import { PublicState } from './public-state';
import { TeamViewState } from './team-view-state';
import { TeamBreakdown } from '../standings/team-breakdown';

@Component({
  selector: 'app-team-detail-page',
  imports: [RouterLink, TranslocoDirective, DsAvatar, PublicState, CountUp, TeamBreakdown],
  providers: [TeamViewState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-detail-page.html',
})
export class TeamDetailPage {
  readonly store = inject(EventStore);
  readonly direction = inject(DirectionService);
  readonly teamView = inject(TeamViewState);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly code = computed(() => this.params().get('code')?.toUpperCase() ?? '');
  readonly team = computed(
    () =>
      this.teamView.view()?.team ?? this.store.teams().find((team) => team.code === this.code()),
  );
  readonly name = localizedName;
  readonly guideNames = guideNames;
  readonly teamGuides = teamGuides;
  readonly currency = currencyLabel;
  constructor() {
    void this.store.initialize();
    effect(() => this.teamView.code.set(this.code()));
  }
}
