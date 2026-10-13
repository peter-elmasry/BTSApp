import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { canSeeAllOutcomes, EventStore } from '../../core/player/event.store';
import type { PublicAdjustment, PublicMatch } from '../../core/player/public-types';
import { DsAvatar } from '../../shared/ui/avatar';
import { CountUp } from '../../shared/ui/count-up';
import { DsCellDef, DsDataTable, type DsColumn } from '../../shared/ui/data-table';
import { DsLivesMeter } from '../../shared/ui/lives-meter';
import { DsOutcome } from '../../shared/ui/outcome';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { DsStatusPill, type DsStatus } from '../../shared/ui/status-pill';
import { lifeEmoji } from '../../core/player/scoring';
import { localizedLocation, localizedName, teamGuides } from '../public/public-helpers';
import { TeamViewState } from '../public/team-view-state';

/** A team's own outcome in a match ('PENDING' when not entered or not visible). */
export function ownOutcome(match: Pick<PublicMatch, 'participants'>, code: string) {
  return match.participants.find((item) => item.team_code === code)?.outcome ?? 'PENDING';
}

/**
 * Match-by-match breakdown of one team, reconciled with its total (A7). Reads the
 * `TeamViewState` provided by its host (the drill-down sheet or the team page).
 */
@Component({
  selector: 'app-team-breakdown',
  imports: [
    RouterLink,
    TranslocoDirective,
    DsAvatar,
    DsStatusPill,
    CountUp,
    DsDataTable,
    DsCellDef,
    DsLivesMeter,
    DsOutcome,
    DsPhoneLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-breakdown.html',
})
export class TeamBreakdown {
  readonly code = input.required<string>();
  /** Show the avatar/guides summary card (the team page has its own header). */
  readonly summary = input(true);
  /** Offer "Open team page" (inside the sheet). */
  readonly openPage = input(true);
  readonly navigated = output<void>();
  readonly state = inject(TeamViewState);
  readonly events = inject(EventStore);
  readonly direction = inject(DirectionService);
  private readonly auth = inject(AuthStore);
  readonly staff = computed(() => canSeeAllOutcomes(this.events.event(), this.auth.profile()));
  readonly view = this.state.view;
  readonly breakdown = computed(() => this.view()?.breakdown ?? null);
  readonly lives = computed(() => this.breakdown()?.scoring_mode === 'LIVES');
  readonly emoji = computed(() => lifeEmoji(this.events.event()));
  readonly matches = computed(() => {
    const rounds = new Map(this.events.rounds().map((round) => [round.id, round]));
    return [...(this.view()?.matches ?? [])].sort(
      (a, b) => (rounds.get(a.round_id)?.number ?? 0) - (rounds.get(b.round_id)?.number ?? 0),
    );
  });
  /** Guide phones arrive only when the event shows them (server rule, phase4_team_json). */
  readonly guides = computed(() => teamGuides(this.view()?.team));
  readonly trackMatch = (match: PublicMatch) => match.id;
  readonly trackAdjustment = (item: PublicAdjustment) => item.id;

  constructor() {
    effect(() => this.state.code.set(this.code()));
  }

  name(value: { name_en?: string | null; name_ar?: string | null } | null | undefined) {
    return localizedName(value, this.direction.language());
  }
  round(match: PublicMatch) {
    const round = this.events.rounds().find((item) => item.id === match.round_id);
    return round ? this.name(round) || null : null;
  }
  roundNumber(match: PublicMatch) {
    return this.events.rounds().find((item) => item.id === match.round_id);
  }
  game(match: PublicMatch) {
    return this.events.games().find((item) => item.id === match.game_id);
  }
  location(match: PublicMatch) {
    return localizedLocation(this.game(match), this.direction.language());
  }
  opponents(match: PublicMatch) {
    return match.participants
      .filter((item) => item.team_code !== this.code())
      .map(
        (item) =>
          this.name(this.events.teams().find((team) => team.code === item.team_code)) ||
          item.team_code,
      )
      .join(' · ');
  }
  outcome(match: PublicMatch) {
    return ownOutcome(match, this.code());
  }
  /** Same wording as the schedule: not played yet vs. played and waiting for its result. */
  status(match: PublicMatch): DsStatus {
    const round = this.events.rounds().find((item) => item.id === match.round_id);
    if (round?.status === 'ACTIVE') return 'live';
    if (round?.status === 'CLOSED') return 'pending';
    return 'scheduled';
  }
  value(match: PublicMatch) {
    const raw = this.lives() ? match.lives_delta : match.points;
    if (raw === undefined || raw === null || match.status !== 'COMPLETED') return '—';
    return raw > 0 ? `+${raw}` : `${raw}`;
  }
  signed(value: number) {
    return value > 0 ? `+${value}` : `${value}`;
  }
  time(value: string) {
    return new Date(value).toLocaleString(
      this.direction.language() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
      { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' },
    );
  }
  matchColumns(t: (key: string) => string): DsColumn<PublicMatch>[] {
    return [
      { key: 'round', header: t('breakdown.round') },
      { key: 'game', header: t('breakdown.game') },
      { key: 'opponent', header: t('breakdown.opponent'), priority: 2 },
      { key: 'outcome', header: t('breakdown.outcome') },
      {
        key: 'value',
        header: t(this.lives() ? 'breakdown.lives' : 'breakdown.points'),
        numeric: true,
        value: (match) => this.value(match),
      },
    ];
  }
  adjustmentColumns(t: (key: string) => string): DsColumn<PublicAdjustment>[] {
    return [
      {
        key: 'points',
        header: t('breakdown.points'),
        numeric: true,
        value: (item) => this.signed(item.points),
      },
      { key: 'reason', header: t('breakdown.reason'), value: (item) => item.reason },
      {
        key: 'by',
        header: t('breakdown.by'),
        priority: 2,
        value: (item) => this.name(item.given_by),
      },
      {
        key: 'time',
        header: t('breakdown.time'),
        priority: 3,
        value: (item) => this.time(item.created_at),
      },
    ];
  }
}
