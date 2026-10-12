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
import type { PublicMatch } from '../../core/player/public-types';
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
export type ScheduleView = 'table' | 'cards';
const VIEW_KEY = 'bts.schedule.view';
@Component({
  selector: 'app-schedule-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    PublicMatchCard,
    BreakCard,
    PublicState,
    LifeLostOverlay,
  ],
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
  /** Table is the default (D039); the choice is remembered on this device. */
  readonly view = signal<ScheduleView>(this.restoreView());
  readonly views: ScheduleView[] = ['table', 'cards'];
  /** Flat rows for the table view, in the same order as the grouped cards. */
  readonly tableRows = computed(() => this.groups().flatMap((group) => group.rows));
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
  setView(view: ScheduleView) {
    this.view.set(view);
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* The view still switches for this visit without storage. */
    }
  }
  private restoreView(): ScheduleView {
    try {
      return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table';
    } catch {
      return 'table';
    }
  }
  teamNames(match: PublicMatch) {
    return match.participants.map((participant) => ({
      code: participant.team_code,
      own: participant.team_code === this.selection.selectedCode(),
      name:
        this.name(
          this.store.teams().find((team) => team.id === participant.team_id),
          this.direction.language(),
        ) || participant.team_code,
    }));
  }
  ownOutcome(match: PublicMatch) {
    return match.participants.find(
      (participant) => participant.team_code === this.selection.selectedCode(),
    )?.outcome;
  }
}
