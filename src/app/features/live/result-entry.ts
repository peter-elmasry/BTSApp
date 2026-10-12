import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type {
  LiveMatch,
  LiveSnapshot,
  MatchOutcome,
  ResultOutcome,
} from '../../core/live/live-types';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { DsAvatar } from '../../shared/ui/avatar';
import { localizedName } from '../public/public-helpers';
import { canEditLiveMatch, liveErrorKey, validOutcomes } from './live-helpers';

export const REGULAR_CHOICES = {
  aWins: ['WIN', 'LOSS'],
  draw: ['DRAW', 'DRAW'],
  bWins: ['LOSS', 'WIN'],
  aForfeits: ['FORFEIT', 'WIN'],
  bForfeits: ['WIN', 'FORFEIT'],
  bothForfeit: ['FORFEIT', 'FORFEIT'],
} as const;
export type RegularChoice = keyof typeof REGULAR_CHOICES;

/** The choice matching a regular match's current outcomes, if any. */
export function currentChoice(outcomes: readonly (string | undefined)[]): RegularChoice | null {
  const joined = outcomes.join('/');
  return (
    (Object.entries(REGULAR_CHOICES).find(([, values]) => values.join('/') === joined)?.[0] as
      RegularChoice | undefined) ?? null
  );
}

/**
 * Result entry for one match: regular segmented choice (+ forfeits) or opening winners,
 * then an inline review step before submitting through the offline queue.
 */
@Component({
  selector: 'app-result-entry',
  imports: [TranslocoDirective, DsAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './result-entry.html',
})
export class ResultEntry {
  readonly snapshot = input.required<LiveSnapshot>();
  readonly match = input.required<LiveMatch>();
  readonly saved = output<'sent' | 'queued'>();
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  readonly queue = inject(OpQueueService);
  readonly direction = inject(DirectionService);
  readonly round = computed(() =>
    this.snapshot().rounds.find((round) => round.id === this.match().round_id),
  );
  readonly canEdit = computed(() =>
    canEditLiveMatch(this.snapshot(), this.match(), this.auth.profile()),
  );
  readonly teams = computed(() =>
    this.match().participants.map((participant) => ({
      ...participant,
      team: this.snapshot().teams.find((team) => team.id === participant.team_id),
    })),
  );
  readonly choice = signal<RegularChoice | null>(null);
  readonly opening = signal<Record<string, ResultOutcome>>({});
  readonly winners = computed(
    () => Object.values(this.opening()).filter((outcome) => outcome === 'WIN').length,
  );
  readonly primaryChoices: RegularChoice[] = ['aWins', 'draw', 'bWins'];
  readonly forfeitChoices: RegularChoice[] = ['aForfeits', 'bForfeits', 'bothForfeit'];
  readonly outcomes = computed<MatchOutcome[]>(() => {
    if (this.round()?.type === 'OPENING')
      return this.teams().map((team) => ({
        team_id: team.team_id,
        outcome: this.opening()[team.team_id] ?? 'LOSS',
      }));
    const choice = this.choice();
    return choice
      ? this.teams().map((team, index) => ({
          team_id: team.team_id,
          outcome: REGULAR_CHOICES[choice][index],
        }))
      : [];
  });
  readonly valid = computed(
    () =>
      !!this.round() &&
      validOutcomes(
        this.round()!.type,
        this.teams().map((team) => team.team_id),
        this.outcomes(),
      ),
  );
  readonly reviewing = signal(false);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly queued = computed(() =>
    this.queue
      .operations()
      .some(
        (operation) =>
          operation.name === 'submit_match_result' && operation.args['p_match'] === this.match().id,
      ),
  );

  private version = 0;

  constructor() {
    let initialized = '';
    effect(() => {
      const match = this.match();
      if (initialized === match.id) return;
      initialized = match.id;
      this.version++;
      this.saving.set(false);
      this.reviewing.set(false);
      this.notice.set('');
      this.opening.set(
        Object.fromEntries(
          match.participants.map((participant) => [
            participant.team_id,
            participant.outcome && participant.outcome !== 'PENDING' ? participant.outcome : 'LOSS',
          ]),
        ),
      );
      this.choice.set(currentChoice(match.participants.map((participant) => participant.outcome)));
    });
    // A permission change (sign-out, role removed) cancels a pending review.
    effect(() => {
      if (!this.canEdit()) this.reviewing.set(false);
    });
  }

  name(value: { name_en?: string | null; name_ar?: string | null } | null | undefined) {
    return localizedName(value, this.direction.language());
  }
  teamName(id: string) {
    return this.name(this.snapshot().teams.find((team) => team.id === id));
  }
  select(choice: RegularChoice) {
    this.choice.set(choice);
    this.reviewing.set(false);
  }
  toggle(teamId: string, outcome: 'WIN' | 'FORFEIT') {
    this.reviewing.set(false);
    this.opening.update((value) => ({
      ...value,
      [teamId]: value[teamId] === outcome ? 'LOSS' : outcome,
    }));
  }
  review() {
    if (this.queue.ready() && this.canEdit() && this.valid() && !this.saving() && !this.queued())
      this.reviewing.set(true);
  }
  async submit() {
    if (
      !this.reviewing() ||
      !this.queue.ready() ||
      !this.canEdit() ||
      !this.valid() ||
      this.saving() ||
      this.queued()
    )
      return;
    this.saving.set(true);
    const version = this.version;
    try {
      const receipt = await this.api.mutate('submit_match_result', {
        p_match: this.match().id,
        p_outcomes: this.outcomes(),
      });
      if (version !== this.version) return;
      this.reviewing.set(false);
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.resultSaved');
      this.saved.emit(receipt.status);
    } catch (error) {
      if (version === this.version) this.notice.set(liveErrorKey(error));
    } finally {
      if (version === this.version) this.saving.set(false);
    }
  }
}
