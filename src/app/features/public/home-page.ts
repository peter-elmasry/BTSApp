import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { DsAvatar } from '../../shared/ui/avatar';
import { PublicMatchCard } from './match-card';
import { localizedName } from './public-helpers';
import { PublicState } from './public-state';
import { TeamViewState } from './team-view-state';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, TranslocoDirective, DsAvatar, PublicMatchCard, PublicState],
  providers: [TeamViewState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
})
export class HomePage {
  readonly store = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly direction = inject(DirectionService);
  readonly teamView = inject(TeamViewState);
  readonly name = localizedName;
  readonly matches = computed(() => {
    const own = this.teamView.view()?.matches;
    return (
      own ??
      this.store
        .schedule()
        .filter((match) =>
          match.participants.some(
            (participant) => participant.team_code === this.selection.selectedCode(),
          ),
        )
    );
  });
  readonly current = computed(() => {
    const active = this.store.rounds().find((round) => round.status === 'ACTIVE');
    return (
      this.matches().find((match) => match.round_id === active?.id && match.status !== 'VOID') ??
      null
    );
  });
  readonly next = computed(() => {
    const rounds = new Map(this.store.rounds().map((round) => [round.id, round]));
    return this.matches()
      .filter((match) => rounds.get(match.round_id)?.status === 'DRAFT' && match.status !== 'VOID')
      .sort(
        (a, b) => (rounds.get(a.round_id)?.number ?? 0) - (rounds.get(b.round_id)?.number ?? 0),
      );
  });
  private touch: { x: number; y: number } | null = null;

  constructor() {
    void this.store.initialize();
    effect(() => this.teamView.code.set(this.selection.selectedCode() ?? ''));
  }
  refresh() {
    void this.store.refresh();
  }
  startPull(event: TouchEvent) {
    this.touch =
      window.scrollY === 0 && event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : null;
  }
  finishPull(event: TouchEvent) {
    const touch = event.changedTouches[0];
    if (
      this.touch &&
      touch &&
      touch.clientY - this.touch.y > 80 &&
      Math.abs(touch.clientX - this.touch.x) < 50 &&
      !this.store.loading()
    )
      this.refresh();
    this.touch = null;
  }
}
