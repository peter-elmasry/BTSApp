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
import { ViewerScope } from '../../core/player/viewer-scope';
import {
  DsCellDef,
  DsDataTable,
  type DsColumn,
  type DsRowStatus,
  phoneSignal,
} from '../../shared/ui/data-table';
import { DsOutcome } from '../../shared/ui/outcome';
import { DsStatusPill, type DsStatus } from '../../shared/ui/status-pill';
import { BreakCard } from './break-card';
import { LifeLostOverlay } from './life-lost-overlay';
import { PublicMatchCard } from './match-card';
import { localizedLocation, localizedName } from './public-helpers';
import { PublicState } from './public-state';
import { TeamViewState } from './team-view-state';
import {
  groupByGame,
  groupByRound,
  type ScheduleGroup,
  type ScheduleRow,
  sortedRounds,
  teamRows,
} from './schedule-model';

type ScheduleTab = 'myTeam' | 'byRound' | 'byGame';
export type ScheduleView = 'table' | 'cards';
import { GameLink, TeamLink } from '../quick-look/quick-links';

const VIEW_KEY = 'bts.schedule.view';
@Component({
  selector: 'app-schedule-page',
  imports: [
    GameLink,
    TeamLink,
    RouterLink,
    TranslocoDirective,
    PublicMatchCard,
    BreakCard,
    PublicState,
    LifeLostOverlay,
    DsDataTable,
    DsCellDef,
    DsOutcome,
    DsStatusPill,
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
  readonly scope = inject(ViewerScope);
  /**
   * Visitors without a login see only their own team's schedule (D046); signed-in staff
   * see every view and need no team of their own.
   */
  readonly tabs = computed<ScheduleTab[]>(() =>
    !this.scope.member()
      ? ['myTeam']
      : this.selection.selectedCode()
        ? ['myTeam', 'byRound', 'byGame']
        : ['byRound', 'byGame'],
  );
  /** The chosen tab, or the first one this viewer may use. */
  readonly activeTab = computed(() =>
    this.tabs().includes(this.tab()) ? this.tab() : this.tabs()[0],
  );
  /** Table is the default (D039); the choice is remembered on this device. */
  readonly view = signal<ScheduleView>(this.restoreView());
  readonly views: ScheduleView[] = ['table', 'cards'];
  /** Phones always get the compact table rows; the switch shows from 640 px (D056). */
  readonly phone = phoneSignal();
  readonly shownView = computed<ScheduleView>(() => (this.phone() ? 'table' : this.view()));
  /** Flat rows for the table view, in the same order as the grouped cards. */
  readonly tableRows = computed(() => this.groups().flatMap((group) => group.rows));
  readonly name = localizedName;
  readonly location = localizedLocation;
  readonly track = (row: ScheduleRow) => row.key;
  readonly rowStatus = (row: ScheduleRow): DsRowStatus =>
    row.round.status === 'ACTIVE' ? 'live' : null;
  /** My team's matches stand out in the by-round and by-game views. */
  readonly ownRow = (row: ScheduleRow) =>
    this.activeTab() !== 'myTeam' &&
    !!row.match?.participants.some(
      (participant) => participant.team_code === this.selection.selectedCode(),
    );
  readonly searchText = (row: ScheduleRow) =>
    [
      this.name(row.game, this.direction.language()),
      ...(row.match ? this.teamNames(row.match).map((team) => team.name) : []),
    ].join(' ');
  readonly matches = computed(() => {
    const own = new Map((this.teamView.view()?.matches ?? []).map((match) => [match.id, match]));
    return this.store.schedule().map((match) => own.get(match.id) ?? match);
  });
  readonly groups = computed<ScheduleGroup[]>(() => {
    const rounds = this.store.rounds();
    const games = this.store.games();
    const matches = this.matches();
    const tab = this.activeTab();
    if (tab === 'byGame') return groupByGame(rounds, games, matches);
    if (tab === 'byRound') return groupByRound(rounds, games, matches);
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
  columns(t: (key: string) => string): DsColumn<ScheduleRow>[] {
    return [
      { key: 'round', header: t('live.roundColumn'), rowHeader: true },
      { key: 'game', header: t('manage.game') },
      { key: 'teams', header: t('player.teamsColumn') },
      { key: 'result', header: t('player.resultColumn') },
    ];
  }
  status(row: ScheduleRow): DsStatus {
    const match = row.match;
    if (!match) return 'scheduled';
    if (match.status === 'COMPLETED') return 'done';
    if (match.status === 'VOID') return 'void';
    if (row.round.status === 'ACTIVE') return 'live';
    if (row.round.status === 'CLOSED') return 'pending';
    return 'scheduled';
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
