import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventStore } from '../../core/player/event.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { StandingsReader } from '../../core/standings/standings-reader';
import { StandingsList } from './standings-list';
import { TeamBreakdownSheet } from './team-breakdown-sheet';

@Component({
  selector: 'app-leaderboard-page',
  imports: [RouterLink, TranslocoDirective, StandingsList, TeamBreakdownSheet],
  providers: [StandingsReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leaderboard-page.html',
})
export class LeaderboardPage {
  readonly events = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly standings = inject(StandingsReader);
  /** Team whose match breakdown is open (rows the viewer may open, D046). */
  readonly drill = signal<string | null>(null);
  /** Results of ended rounds still missing: totals may still change (D041). */
  readonly lateResults = computed(() =>
    this.events.rounds().reduce((sum, round) => sum + (round.late_count ?? 0), 0),
  );
  constructor() {
    void this.events.initialize();
    effect(() => this.standings.eventId.set(this.events.event()?.id ?? null));
  }
  refresh() {
    void this.events.refresh();
    void this.standings.refresh();
  }
}
