import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { DsAvatar } from '../../shared/ui/avatar';
import { PublicMatchCard } from './match-card';
import { localizedName } from './public-helpers';
import { PublicState } from './public-state';
import { TeamViewState } from './team-view-state';

@Component({
  selector: 'app-team-detail-page',
  imports: [RouterLink, TranslocoDirective, DsAvatar, PublicMatchCard, PublicState],
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
  readonly matches = computed(() => {
    const order = new Map(this.store.rounds().map((round) => [round.id, round.number]));
    return [...(this.teamView.view()?.matches ?? [])].sort(
      (a, b) => (order.get(a.round_id) ?? 0) - (order.get(b.round_id) ?? 0),
    );
  });
  readonly name = localizedName;
  constructor() {
    void this.store.initialize();
    effect(() => this.teamView.code.set(this.code()));
  }
  date(value: string) {
    return new Date(value).toLocaleString(
      this.direction.language() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
      { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' },
    );
  }
}
