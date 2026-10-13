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
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { canSeeAllOutcomes, EventStore } from '../../core/player/event.store';
import { PublicApi } from '../../core/player/public-api';
import type { PublicMatch, PublicRound, PublicTeamView } from '../../core/player/public-types';
import { isLivesMode, lifeEmoji } from '../../core/player/scoring';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { ViewerScope } from '../../core/player/viewer-scope';
import { DsAvatar } from '../../shared/ui/avatar';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { DsOutcome } from '../../shared/ui/outcome';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { DsTimerRing } from '../../shared/ui/timer-ring';
import { localizedLocation, localizedName, teamGuides } from '../public/public-helpers';
import { QuickLook, type DirectoryContact } from './quick-look.service';

interface Contact {
  name_en: string;
  name_ar: string | null;
  phone?: string | null;
}

/** The quick-look sheet for a team or a game (D055), opened from any name. */
@Component({
  selector: 'app-quick-look-sheet',
  imports: [
    RouterLink,
    TranslocoDirective,
    DsAvatar,
    DsBottomSheet,
    DsOutcome,
    DsPhoneLink,
    DsTimerRing,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quick-look-sheet.html',
})
export class QuickLookSheet {
  readonly look = inject(QuickLook);
  readonly store = inject(EventStore);
  readonly direction = inject(DirectionService);
  readonly scope = inject(ViewerScope);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(PublicApi);
  private readonly selection = inject(TeamSelectionStore);
  readonly name = localizedName;
  readonly location = localizedLocation;

  readonly team = computed(() => {
    const target = this.look.target();
    return target?.kind === 'team'
      ? (this.store.teams().find((team) => team.code === target.id) ?? null)
      : null;
  });
  readonly game = computed(() => {
    const target = this.look.target();
    return target?.kind === 'game'
      ? (this.store.games().find((game) => game.id === target.id) ?? null)
      : null;
  });
  readonly activeRound = computed(
    () => this.store.rounds().find((round) => round.status === 'ACTIVE') ?? null,
  );
  readonly seeAll = computed(() => canSeeAllOutcomes(this.store.event(), this.auth.profile()));
  readonly lives = computed(() => isLivesMode(this.store.event()));
  readonly emoji = computed(() => lifeEmoji(this.store.event()));
  /** One points name per event (D054). */
  readonly pointsName = computed(() => this.store.event()?.currency_ar_plural || '');

  /** Team view (score, rank) for the opened team; loaded only when the viewer may see it. */
  readonly view = signal<PublicTeamView | null>(null);
  readonly showScore = computed(() => {
    const team = this.team();
    if (!team) return false;
    return this.seeAll() || (this.lives() && team.code === this.selection.selectedCode());
  });

  constructor() {
    effect(() => {
      const team = this.team();
      const event = this.store.event();
      const show = this.showScore();
      this.view.set(null);
      if (!team || !event || !show) return;
      void this.api
        .teamView(event.id, team.code)
        .then((view) => {
          if (this.team()?.code === team.code) this.view.set(view);
        })
        .catch(() => undefined);
    });
  }

  // ---- shared helpers
  private roundOf(match: PublicMatch): PublicRound | undefined {
    return this.store.rounds().find((round) => round.id === match.round_id);
  }
  roundLabel(match: PublicMatch, t: (key: string, params?: Record<string, unknown>) => string) {
    const round = this.roundOf(match);
    return round?.type === 'OPENING'
      ? t('round.opening')
      : t('player.roundNumber', { n: round?.number ?? '' });
  }
  gameOf(match: PublicMatch) {
    return this.store.games().find((game) => game.id === match.game_id);
  }
  teamName(code: string) {
    return (
      this.name(
        this.store.teams().find((team) => team.code === code),
        this.direction.language(),
      ) || code
    );
  }
  teamsOf(match: PublicMatch) {
    return match.participants.map((participant) => this.teamName(participant.team_code));
  }
  private ordered(matches: PublicMatch[]) {
    return [...matches].sort(
      (a, b) => (this.roundOf(a)?.number ?? 0) - (this.roundOf(b)?.number ?? 0),
    );
  }

  // ---- team
  private teamMatches = computed(() => {
    const code = this.team()?.code;
    if (!code) return [];
    return this.ordered(
      this.store
        .schedule()
        .filter(
          (match) =>
            match.status !== 'VOID' &&
            match.participants.some((participant) => participant.team_code === code),
        ),
    );
  });
  readonly teamNow = computed(
    () => this.teamMatches().find((match) => match.round_id === this.activeRound()?.id) ?? null,
  );
  readonly teamNext = computed(
    () => this.teamMatches().find((match) => this.roundOf(match)?.status === 'DRAFT') ?? null,
  );
  readonly teamLast = computed(
    () =>
      [...this.teamMatches()]
        .reverse()
        .find(
          (match) => match.status === 'COMPLETED' && this.roundOf(match)?.status === 'CLOSED',
        ) ?? null,
  );
  opponents(match: PublicMatch) {
    const code = this.team()?.code;
    return match.participants
      .filter((participant) => participant.team_code !== code)
      .map((participant) => this.teamName(participant.team_code))
      .join(' · ');
  }
  ownOutcome(match: PublicMatch) {
    const code = this.team()?.code;
    return match.participants.find((participant) => participant.team_code === code)?.outcome;
  }
  readonly guides = computed<Contact[]>(() => {
    const team = this.team();
    if (!team) return [];
    const staff: DirectoryContact[] | null = this.look.guidesOf(team.id);
    return staff ?? teamGuides(team);
  });

  // ---- game
  private gameMatches = computed(() => {
    const game = this.game();
    if (!game) return [];
    return this.ordered(
      this.store
        .schedule()
        .filter((match) => match.game_id === game.id && match.status !== 'VOID')
        // Visitors only see the matches of their own team (D046).
        .filter(
          (match) =>
            this.scope.member() ||
            match.participants.some(
              (participant) => participant.team_code === this.selection.selectedCode(),
            ),
        ),
    );
  });
  readonly gameNow = computed(
    () => this.gameMatches().find((match) => match.round_id === this.activeRound()?.id) ?? null,
  );
  readonly gameNext = computed(
    () => this.gameMatches().find((match) => this.roundOf(match)?.status === 'DRAFT') ?? null,
  );
  readonly gameDone = computed(() =>
    this.gameMatches().filter((match) => match.status === 'COMPLETED'),
  );
  readonly referees = computed<Contact[]>(() => {
    const game = this.game();
    if (!game) return [];
    return (
      this.look.refereesOf(game.id) ??
      (game.referees ?? []).map((ref) => ({
        ...ref,
        name_ar: ref.name_ar ?? null,
        name_en: ref.name_en ?? '',
      }))
    );
  });
  outcomeOf(match: PublicMatch, code: string) {
    return match.participants.find((participant) => participant.team_code === code)?.outcome;
  }
}
