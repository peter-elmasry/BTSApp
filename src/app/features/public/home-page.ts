import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { StandingsReader } from '../../core/standings/standings-reader';
import { DsAvatar } from '../../shared/ui/avatar';
import { DsLivesMeter } from '../../shared/ui/lives-meter';
import { isLivesMode, lifeEmoji, livesLeft } from '../../core/player/scoring';
import { LifeLostOverlay } from './life-lost-overlay';
import { currencyLabel } from '../standings/rank-motion';
import { StandingsList } from '../standings/standings-list';
import { CountUp } from '../../shared/ui/count-up';
import { DsCellDef, DsDataTable, type DsColumn } from '../../shared/ui/data-table';
import { DsOutcome } from '../../shared/ui/outcome';
import { DsStatusPill } from '../../shared/ui/status-pill';
import { DsTimerRing } from '../../shared/ui/timer-ring';
import { ViewerScope } from '../../core/player/viewer-scope';
import type { PublicMatch } from '../../core/player/public-types';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { guideNames, localizedLocation, localizedName, teamGuides } from './public-helpers';
import { PublicState } from './public-state';
import { TeamViewState } from './team-view-state';

import { GameLink, TeamLink } from '../quick-look/quick-links';
@Component({
  selector: 'app-home-page',
  imports: [
    GameLink,
    TeamLink,
    RouterLink,
    TranslocoDirective,
    DsAvatar,
    DsDataTable,
    DsCellDef,
    DsOutcome,
    DsStatusPill,
    DsTimerRing,
    PublicState,
    StandingsList,
    CountUp,
    DsLivesMeter,
    LifeLostOverlay,
    DsPhoneLink,
  ],
  providers: [TeamViewState, StandingsReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
})
export class HomePage {
  readonly store = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly direction = inject(DirectionService);
  readonly teamView = inject(TeamViewState);
  readonly standings = inject(StandingsReader);
  readonly currency = currencyLabel;
  readonly ownStanding = computed(() =>
    this.standings.rows().find((row) => row.team.code === this.selection.selectedCode()),
  );
  readonly preview = computed(() => this.standings.rows().slice(0, 5));
  readonly livesMode = computed(() => isLivesMode(this.store.event()));
  readonly emoji = computed(() => lifeEmoji(this.store.event()));
  /** Own lives come from the server team view, so they show even when standings are hidden. */
  readonly lives = computed(() =>
    this.selection.selectedCode() ? livesLeft(this.teamView.view()) : null,
  );
  readonly name = localizedName;
  readonly location = localizedLocation;
  readonly scope = inject(ViewerScope);
  readonly track = (match: PublicMatch) => match.id;
  readonly activeRound = computed(
    () => this.store.rounds().find((round) => round.status === 'ACTIVE') ?? null,
  );
  readonly guideNames = guideNames;
  readonly teamGuides = teamGuides;
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
  /** Latest finished match of my team in an ended round, so between rounds home is not empty. */
  readonly lastResult = computed(() => {
    const rounds = new Map(this.store.rounds().map((round) => [round.id, round]));
    return (
      this.matches()
        .filter((match) => {
          const outcome = this.ownOutcomeOf(match);
          return (
            rounds.get(match.round_id)?.status === 'CLOSED' &&
            match.status === 'COMPLETED' &&
            !!outcome &&
            outcome !== 'PENDING'
          );
        })
        .sort(
          (a, b) => (rounds.get(b.round_id)?.number ?? 0) - (rounds.get(a.round_id)?.number ?? 0),
        )[0] ?? null
    );
  });
  private touch: { x: number; y: number } | null = null;

  constructor() {
    void this.store.initialize();
    effect(() => this.teamView.code.set(this.selection.selectedCode() ?? ''));
    effect(() => this.standings.eventId.set(this.store.event()?.id ?? null));
  }
  gameOf(match: PublicMatch) {
    return this.store.games().find((game) => game.id === match.game_id);
  }
  roundOf(match: PublicMatch) {
    return this.store.rounds().find((round) => round.id === match.round_id);
  }
  isOpening(match: PublicMatch) {
    return this.roundOf(match)?.type === 'OPENING';
  }
  roundLabel(match: PublicMatch, t: (key: string, params?: Record<string, unknown>) => string) {
    const round = this.roundOf(match);
    return round?.type === 'OPENING'
      ? t('round.opening')
      : t('player.roundNumber', { n: round?.number });
  }
  opponents(match: PublicMatch) {
    return match.participants
      .filter((participant) => participant.team_code !== this.selection.selectedCode())
      .map((participant) => ({
        ...participant,
        team: this.store.teams().find((team) => team.id === participant.team_id),
      }));
  }
  ownOutcomeOf(match: PublicMatch) {
    return match.participants.find(
      (participant) => participant.team_code === this.selection.selectedCode(),
    )?.outcome;
  }
  nextColumns(t: (key: string) => string): DsColumn<PublicMatch>[] {
    return [
      { key: 'round', header: t('live.roundColumn') },
      { key: 'game', header: t('manage.game') },
      { key: 'opponent', header: t('player.opponent') },
      { key: 'status', header: t('now.status'), priority: 2 },
    ];
  }
  refresh() {
    void this.store.refresh();
    this.teamView.refresh();
    this.standings.refresh();
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
