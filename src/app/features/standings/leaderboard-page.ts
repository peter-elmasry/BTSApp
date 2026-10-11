import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventStore } from '../../core/player/event.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { StandingsReader } from '../../core/standings/standings-reader';
import { StandingsList } from './standings-list';

@Component({
  selector: 'app-leaderboard-page',
  imports: [RouterLink, TranslocoDirective, StandingsList],
  providers: [StandingsReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leaderboard-page.html',
})
export class LeaderboardPage {
  readonly events = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly standings = inject(StandingsReader);
  constructor() {
    void this.events.initialize();
    effect(() => this.standings.eventId.set(this.events.event()?.id ?? null));
  }
  refresh() {
    void this.events.refresh();
    void this.standings.refresh();
  }
}
