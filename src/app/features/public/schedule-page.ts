import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { BreakCard } from './break-card';
import { LifeLostOverlay } from './life-lost-overlay';
import { PublicMatchCard } from './match-card';
import { localizedName } from './public-helpers';
import { PublicState } from './public-state';
import { TeamViewState } from './team-view-state';
import {
  groupByGame,
  groupByRound,
  type ScheduleGroup,
  sortedRounds,
  teamRows,
} from './schedule-model';

type ScheduleTab = 'myTeam' | 'byRound' | 'byGame';
@Component({
  selector: 'app-schedule-page',
  imports: [TranslocoDirective, PublicMatchCard, BreakCard, PublicState, LifeLostOverlay],
  providers: [TeamViewState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schedule-page.html',
})
export class SchedulePage {
  readonly store = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly direction = inject(DirectionService);
  readonly teamView = inject(TeamViewState);
  readonly tab = signal<ScheduleTab>('myTeam');
  readonly tabs: ScheduleTab[] = ['myTeam', 'byRound', 'byGame'];
  readonly name = localizedName;
  readonly matches = computed(() => {
    const own = new Map((this.teamView.view()?.matches ?? []).map((match) => [match.id, match]));
    return this.store.schedule().map((match) => own.get(match.id) ?? match);
  });
  readonly groups = computed<ScheduleGroup[]>(() => {
    const rounds = this.store.rounds();
    const games = this.store.games();
    const matches = this.matches();
    if (this.tab() === 'byGame') return groupByGame(rounds, games, matches);
    if (this.tab() === 'byRound') return groupByRound(rounds, games, matches);
    const rows = teamRows(rounds, games, matches, this.selection.selectedCode());
    return sortedRounds(rounds)
      .map((round) => ({
        id: round.id,
        round,
        game: null,
        rows: rows.filter((row) => row.round.id === round.id),
      }))
      .filter((group) => group.rows.length);
  });
  constructor() {
    void this.store.initialize();
    effect(() => this.teamView.code.set(this.selection.selectedCode() ?? ''));
  }
}
