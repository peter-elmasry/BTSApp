import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { LiveMutation } from '../../core/live/live-types';
import { ServerClockService } from '../../core/time/server-clock.service';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { AdjustmentsPanel } from '../live/adjustments-panel';
import { isLiveAdmin, liveErrorKey } from '../live/live-helpers';
import { LiveReader } from '../live/live-reader';
import { LiveMatchSummary } from '../live/match-summary';
import { localizedName } from '../public/public-helpers';

type Action = {
  name: Exclude<LiveMutation, 'submit_match_result' | 'add_adjustment' | 'revoke_adjustment'>;
  matchId?: string;
  minutes?: number;
  roundId: string;
};
@Component({
  selector: 'app-live-control-page',
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
  templateUrl: './live-page.html',
})
export class LiveControlPage {
  readonly reader = inject(LiveReader);
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  readonly direction = inject(DirectionService);
  private readonly clock = inject(ServerClockService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly eventId = computed(() => this.params().get('eventId') ?? '');
  readonly selectedId = signal('');
  readonly rounds = computed(() =>
    [...(this.reader.data()?.rounds ?? [])].sort((a, b) => a.number - b.number),
  );
  readonly round = computed(() => this.rounds().find((round) => round.id === this.selectedId()));
  readonly matches = computed(
    () => this.reader.data()?.matches.filter((match) => match.round_id === this.selectedId()) ?? [],
  );
  readonly pending = computed(() => this.matches().filter((match) => match.status === 'SCHEDULED'));
  readonly active = computed(() => this.rounds().find((round) => round.status === 'ACTIVE'));
  readonly canAdmin = computed(
    () => !!this.reader.data() && isLiveAdmin(this.auth.profile(), this.eventId()),
  );
  readonly overtime = computed(() => {
    const round = this.active();
    if (!round?.ends_at) return null;
    const seconds = Math.floor((this.clock.now() - Date.parse(round.ends_at)) / 1000);
    return seconds > 0
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : null;
  });
  readonly activePending = computed(
    () =>
      this.reader
        .data()
        ?.matches.filter(
          (match) => match.round_id === this.active()?.id && match.status === 'SCHEDULED',
        ).length ?? 0,
  );
  readonly minutes = new FormControl(5, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(1), Validators.max(120)],
  });
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });
  readonly action = signal<Action | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly name = localizedName;
  private readonly actorContext = computed(() =>
    JSON.stringify([
      this.auth.session()?.user.id,
      this.auth.profile()?.system_role,
      this.auth.profile()?.roles,
    ]),
  );
  private actionVersion = 0;
  constructor() {
    void this.clock.synchronize();
    effect(() => {
      this.actorContext();
      this.reader.source.set({ kind: 'admin', id: this.eventId() });
      this.action.set(null);
      this.selectedId.set('');
      this.saving.set(false);
      this.actionVersion++;
    });
    effect(() => {
      const rounds = this.rounds();
      if (!rounds.some((round) => round.id === this.selectedId()))
        this.selectedId.set(
          rounds.find((round) => round.status === 'ACTIVE')?.id ?? rounds[0]?.id ?? '',
        );
    });
  }
  selectRound(id: string) {
    this.selectedId.set(id);
    this.action.set(null);
  }
  open(name: Action['name'], matchId?: string, minutes?: number) {
    const round = this.round();
    if (!round || !this.canAdmin() || this.saving()) return;
    if (name === 'extend_round' && (!Number.isInteger(minutes) || minutes! < 1 || minutes! > 120)) {
      this.notice.set('errors.INVALID_MINUTES');
      return;
    }
    this.reason.reset('');
    this.action.set({ name, matchId, minutes, roundId: round.id });
  }
  selectActive() {
    if (this.active()) this.selectedId.set(this.active()!.id);
  }
  gameName(id: string) {
    return this.name(
      this.reader.data()?.games.find((game) => game.id === id),
      this.direction.language(),
    );
  }
  openActive(name: 'extend_round' | 'close_round') {
    this.selectActive();
    this.open(name, undefined, name === 'extend_round' ? 5 : undefined);
  }
  needsReason() {
    return this.action()?.name === 'reopen_round' || this.action()?.name === 'void_match';
  }
  async confirmAction() {
    const action = this.action();
    if (!action || !this.canAdmin() || this.saving() || action.roundId !== this.selectedId())
      return;
    if (action.name === 'close_round' && this.pending().length) return;
    if (this.needsReason() && (this.reason.invalid || this.reason.value.trim().length < 3)) {
      this.reason.markAsTouched();
      return;
    }
    const args: Record<string, unknown> = action.matchId
      ? { p_match: action.matchId }
      : { p_round: action.roundId };
    if (action.name === 'extend_round') args['p_minutes'] = action.minutes;
    if (this.needsReason()) args['p_reason'] = this.reason.value.trim();
    const version = ++this.actionVersion;
    this.saving.set(true);
    try {
      const receipt = await this.api.mutate(action.name, args);
      if (version !== this.actionVersion) return;
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.saved');
      this.action.set(null);
      if (receipt.status === 'sent') this.reader.refresh();
    } catch (error) {
      if (version === this.actionVersion) {
        this.notice.set(liveErrorKey(error));
        if (liveErrorKey(error) === 'errors.PENDING_MATCHES') {
          this.action.set(null);
          this.reader.refresh();
        }
      }
    } finally {
      if (version === this.actionVersion) this.saving.set(false);
    }
  }
}
