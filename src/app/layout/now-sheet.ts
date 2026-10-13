import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../core/auth/auth.store';
import { DirectionService } from '../core/i18n/i18n.service';
import { EventStore } from '../core/player/event.store';
import type { PublicMatch } from '../core/player/public-types';
import { TeamSelectionStore } from '../core/player/team-selection.store';
import { localizedLocation, localizedName, refereeNames } from '../features/public/public-helpers';
import { DsBottomSheet } from '../shared/ui/bottom-sheet';
import { CountUp } from '../shared/ui/count-up';
import { DsCellDef, DsDataTable, type DsColumn } from '../shared/ui/data-table';
import { DsOutcome } from '../shared/ui/outcome';
import { DsStatusPill, type DsStatus } from '../shared/ui/status-pill';
import { DsTimerRing } from '../shared/ui/timer-ring';
import { isEventAdmin, isEventReferee } from './navigation';
import {
  activeRound,
  nextDraftRound,
  nextTeamMatch,
  roundProgress,
  teamMatchIn,
} from './now-model';

export function matchStatus(match: Pick<PublicMatch, 'status'>, roundClosed = false): DsStatus {
  if (match.status === 'COMPLETED') return 'done';
  if (match.status === 'VOID') return 'void';
  return roundClosed ? 'late' : 'pending';
}

/** "What is happening now" for every role, one tap from the round banner (UX plan §4.5). */
@Component({
  selector: 'app-now-sheet',
  imports: [
    RouterLink,
    TranslocoDirective,
    DsBottomSheet,
    CountUp,
    DsDataTable,
    DsCellDef,
    DsOutcome,
    DsStatusPill,
    DsTimerRing,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './now-sheet.html',
})
export class NowSheet {
  readonly close = output<void>();
  readonly events = inject(EventStore);
  readonly auth = inject(AuthStore);
  readonly selection = inject(TeamSelectionStore);
  readonly direction = inject(DirectionService);
  readonly eventId = computed(() => this.events.event()?.id ?? null);
  readonly admin = computed(() => isEventAdmin(this.auth.profile(), this.eventId()));
  readonly referee = computed(
    () => !this.admin() && isEventReferee(this.auth.profile(), this.eventId()),
  );
  readonly round = computed(() => activeRound(this.events.rounds()));
  readonly nextRound = computed(() => nextDraftRound(this.events.rounds()));
  readonly progress = computed(() => roundProgress(this.events.schedule(), this.round()?.id));
  readonly roundMatches = computed(() =>
    this.events.schedule().filter((match) => match.round_id === this.round()?.id),
  );
  readonly pendingMatches = computed(() =>
    this.roundMatches().filter((match) => match.status === 'SCHEDULED'),
  );
  readonly myGames = computed(() => {
    const eventId = this.eventId();
    return new Set(
      (this.auth.profile()?.assigned_games ?? [])
        .filter((item) => item.event_id === eventId)
        .map((item) => item.game_id),
    );
  });
  readonly stationMatches = computed(() =>
    this.roundMatches().filter((match) => this.myGames().has(match.game_id)),
  );
  readonly myMatch = computed(() =>
    teamMatchIn(this.events.schedule(), this.round()?.id, this.selection.selectedCode()),
  );
  readonly nextMatch = computed(() =>
    nextTeamMatch(
      this.events.schedule(),
      this.events.rounds(),
      this.selection.selectedCode(),
      this.round()?.number ?? -1,
    ),
  );

  name(value: { name_en?: string | null; name_ar?: string | null } | null | undefined) {
    return localizedName(value, this.direction.language());
  }
  roundLabel(round: {
    number: number;
    type: string;
    name_en: string | null;
    name_ar: string | null;
  }) {
    return this.name(round) || null;
  }
  game(id: string) {
    return this.events.games().find((game) => game.id === id) ?? null;
  }
  location(id: string) {
    return localizedLocation(this.game(id), this.direction.language());
  }
  referees(id: string) {
    return refereeNames(this.game(id), this.direction.language());
  }
  teamName(code: string) {
    return this.name(this.events.teams().find((team) => team.code === code)) || code;
  }
  matchup(match: PublicMatch) {
    return match.participants.map((item) => this.teamName(item.team_code)).join(' · ');
  }
  opponents(match: PublicMatch) {
    const mine = this.selection.selectedCode();
    return match.participants
      .filter((item) => item.team_code !== mine)
      .map((item) => this.teamName(item.team_code))
      .join(' · ');
  }
  myOutcome(match: PublicMatch) {
    return match.participants.find((item) => item.team_code === this.selection.selectedCode())
      ?.outcome;
  }
  status = matchStatus;
  readonly track = (match: PublicMatch) => match.id;
  columns(t: (key: string) => string): DsColumn<PublicMatch>[] {
    return [
      { key: 'game', header: t('now.game'), value: (match) => this.name(this.game(match.game_id)) },
      { key: 'teams', header: t('now.teams'), value: (match) => this.matchup(match) },
      { key: 'status', header: t('now.status'), priority: 2 },
    ];
  }
}
