import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { MatchOutcome, ResultOutcome } from '../../core/live/live-types';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { AdjustmentsPanel } from '../live/adjustments-panel';
import { canEditLiveMatch, liveErrorKey, validOutcomes } from '../live/live-helpers';
import { LiveReader } from '../live/live-reader';
import { LiveMatchSummary } from '../live/match-summary';
import { localizedName } from '../public/public-helpers';

const choices = {
  aWins: ['WIN', 'LOSS'],
  draw: ['DRAW', 'DRAW'],
  bWins: ['LOSS', 'WIN'],
  aForfeits: ['FORFEIT', 'WIN'],
  bForfeits: ['WIN', 'FORFEIT'],
  bothForfeit: ['FORFEIT', 'FORFEIT'],
} as const;
type RegularChoice = keyof typeof choices;

@Component({
  selector: 'app-match-entry-page',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TranslocoDirective,
    DsBottomSheet,
    LiveMatchSummary,
    AdjustmentsPanel,
  ],
  providers: [LiveReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './match-entry-page.html',
})
export class MatchEntryPage {
  readonly reader = inject(LiveReader);
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  readonly queue = inject(OpQueueService);
  readonly direction = inject(DirectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly id = computed(() => this.params().get('id') ?? '');
  readonly match = computed(
    () => this.reader.data()?.matches.find((match) => match.id === this.id()) ?? null,
  );
  readonly round = computed(() =>
    this.reader.data()?.rounds.find((round) => round.id === this.match()?.round_id),
  );
  readonly canEdit = computed(() =>
    canEditLiveMatch(this.reader.data(), this.match(), this.auth.profile()),
  );
  readonly regular = new FormControl<RegularChoice | null>(null);
  private readonly regularValue = toSignal(this.regular.valueChanges, { initialValue: null });
  readonly primaryChoices: RegularChoice[] = ['aWins', 'draw', 'bWins'];
  readonly forfeitChoices: RegularChoice[] = ['aForfeits', 'bForfeits', 'bothForfeit'];
  readonly opening = signal<Record<string, ResultOutcome>>({});
  readonly winners = computed(
    () => Object.values(this.opening()).filter((outcome) => outcome === 'WIN').length,
  );
  readonly teams = computed(() =>
    (this.match()?.participants ?? []).map((participant) => ({
      ...participant,
      team: this.reader.data()?.teams.find((team) => team.id === participant.team_id),
    })),
  );
  readonly outcomes = computed<MatchOutcome[]>(() => {
    if (this.round()?.type === 'OPENING')
      return this.teams().map((team) => ({
        team_id: team.team_id,
        outcome: this.opening()[team.team_id] ?? 'LOSS',
      }));
    const value = this.regularValue();
    return value
      ? this.teams().map((team, index) => ({
          team_id: team.team_id,
          outcome: choices[value][index],
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
  readonly confirmation = signal<MatchOutcome[] | null>(null);
  readonly saving = signal(false);
  private readonly locallyQueued = signal(false);
  readonly queued = computed(
    () =>
      this.locallyQueued() ||
      this.queue
        .operations()
        .some(
          (operation) =>
            operation.name === 'submit_match_result' && operation.args['p_match'] === this.id(),
        ),
  );
  readonly notice = signal('');
  readonly name = localizedName;
  private initializedMatch = '';
  private mutationVersion = 0;
  private readonly actorContext = computed(() =>
    JSON.stringify([
      this.auth.session()?.user.id,
      this.auth.profile()?.system_role,
      this.auth.profile()?.roles,
      this.auth.profile()?.assigned_games,
    ]),
  );

  constructor() {
    effect(() => {
      this.actorContext();
      this.reader.source.set({ kind: 'match', id: this.id() });
      this.initializedMatch = '';
      this.regular.reset(null);
      this.opening.set({});
      this.confirmation.set(null);
      this.locallyQueued.set(false);
      this.saving.set(false);
      this.mutationVersion++;
    });
    effect(() => {
      const match = this.match();
      if (!match || this.initializedMatch === match.id) return;
      this.initializedMatch = match.id;
      this.opening.set(
        Object.fromEntries(
          match.participants.map((participant) => [
            participant.team_id,
            participant.outcome && participant.outcome !== 'PENDING' ? participant.outcome : 'LOSS',
          ]),
        ),
      );
      const values = match.participants.map((participant) => participant.outcome).join('/');
      this.regular.setValue(
        (Object.entries(choices).find(
          ([, outcomes]) => outcomes.join('/') === values,
        )?.[0] as RegularChoice) ?? null,
      );
      this.notice.set('');
    });
    effect(() => {
      if (this.locallyQueued() && this.queue.pending() === 0) {
        this.locallyQueued.set(false);
        this.reader.refresh();
      }
    });
  }
  select(choice: RegularChoice) {
    this.regular.setValue(choice);
  }
  toggle(teamId: string, outcome: 'WIN' | 'FORFEIT') {
    this.opening.update((value) => ({
      ...value,
      [teamId]: value[teamId] === outcome ? 'LOSS' : outcome,
    }));
  }
  review() {
    if (this.queue.ready() && this.canEdit() && this.valid() && !this.saving() && !this.queued())
      this.confirmation.set(this.outcomes().map((item) => ({ ...item })));
  }
  async submit() {
    const outcomes = this.confirmation();
    if (
      !outcomes ||
      !this.queue.ready() ||
      !this.canEdit() ||
      !this.valid() ||
      this.saving() ||
      this.queued() ||
      JSON.stringify(outcomes) !== JSON.stringify(this.outcomes())
    )
      return;
    this.saving.set(true);
    const version = ++this.mutationVersion;
    try {
      const receipt = await this.api.mutate('submit_match_result', {
        p_match: this.id(),
        p_outcomes: outcomes,
      });
      if (version !== this.mutationVersion) return;
      this.locallyQueued.set(receipt.status === 'queued');
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.resultSaved');
      this.confirmation.set(null);
      if (receipt.status === 'sent') this.reader.refresh();
    } catch (error) {
      if (version === this.mutationVersion) this.notice.set(liveErrorKey(error));
    } finally {
      if (version === this.mutationVersion) this.saving.set(false);
    }
  }
  teamName(id: string) {
    return this.name(
      this.reader.data()?.teams.find((team) => team.id === id),
      this.direction.language(),
    );
  }
}
