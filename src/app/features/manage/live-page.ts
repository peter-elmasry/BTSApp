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
import type { LiveMatch } from '../../core/live/live-types';
import { StandingsReader } from '../../core/standings/standings-reader';
import { ServerClockService } from '../../core/time/server-clock.service';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { CountUp } from '../../shared/ui/count-up';
import {
  DsCellDef,
  DsDataTable,
  type DsColumn,
  type DsRowStatus,
} from '../../shared/ui/data-table';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { DsStatusPill, type DsStatus } from '../../shared/ui/status-pill';
import { DsTabs, type DsTabItem } from '../../shared/ui/tabs';
import { DsTimerRing, formatClock } from '../../shared/ui/timer-ring';
import { isLiveAdmin, liveErrorKey } from '../live/live-helpers';
import { LiveReader } from '../live/live-reader';
import { ResultEntry } from '../live/result-entry';
import { localizedLocation, localizedName } from '../public/public-helpers';
import { nextRoundAfter, plannedEnd, validOffset } from './control-model';
import { liveMatchStatus } from './results-page';

type Sheet =
  | { kind: 'start_round'; roundId: string }
  | { kind: 'extend_round'; roundId: string; custom: boolean }
  | { kind: 'close_round'; roundId: string }
  | { kind: 'close_and_start'; roundId: string; nextId: string }
  | { kind: 'reopen_round'; roundId: string }
  | { kind: 'entry'; roundId: string; matchId: string };

/** Event-day control screen (UX plan §3.4): round state, KPIs, chase list and actions. */
@Component({
  selector: 'app-live-control-page',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TranslocoDirective,
    DsBottomSheet,
    CountUp,
    DsDataTable,
    DsCellDef,
    DsPhoneLink,
    DsStatusPill,
    DsTabs,
    DsTimerRing,
    ResultEntry,
  ],
  providers: [LiveReader, StandingsReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './live-page.html',
})
export class LiveControlPage {
  readonly reader = inject(LiveReader);
  private readonly standings = inject(StandingsReader);
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  readonly direction = inject(DirectionService);
  readonly clock = inject(ServerClockService);
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
  readonly active = computed(() => this.rounds().find((round) => round.status === 'ACTIVE'));
  readonly next = computed(() => nextRoundAfter(this.rounds(), this.round()));
  readonly matches = computed(
    () => this.reader.data()?.matches.filter((match) => match.round_id === this.selectedId()) ?? [],
  );
  readonly counted = computed(() => this.matches().filter((match) => match.status !== 'VOID'));
  readonly completed = computed(
    () => this.counted().filter((match) => match.status === 'COMPLETED').length,
  );
  readonly open = computed(() => this.matches().filter((match) => match.status === 'SCHEDULED'));
  readonly late = computed(() =>
    (this.reader.data()?.matches ?? []).filter((match) => this.status(match) === 'late'),
  );
  readonly chase = computed(() => {
    const ids = new Set(this.open().map((match) => match.id));
    return [...this.open(), ...this.late().filter((match) => !ids.has(match.id))];
  });
  readonly adjustmentCount = computed(
    () => (this.reader.data()?.adjustments ?? []).filter((item) => !item.revoked_at).length,
  );
  readonly ties = computed(() => this.standings.rows().filter((row) => row.is_tied).length);
  readonly canAdmin = computed(
    () => !!this.reader.data() && isLiveAdmin(this.auth.profile(), this.eventId()),
  );
  readonly overtime = computed(() => {
    const round = this.round();
    if (round?.status !== 'ACTIVE' || !round.ends_at) return null;
    const seconds = Math.floor((this.clock.now() - Date.parse(round.ends_at)) / 1000);
    return seconds > 0 ? formatClock(seconds, true) : null;
  });
  readonly roundTabs = computed<DsTabItem[]>(() =>
    this.rounds().map((round) => ({
      id: round.id,
      label: this.roundLabel(round),
      badge:
        (this.reader.data()?.matches ?? []).filter(
          (match) => match.round_id === round.id && this.status(match) === 'late',
        ).length || null,
    })),
  );
  readonly sheet = signal<Sheet | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly startMode = signal<'now' | 'ago'>('now');
  readonly minutesAgo = new FormControl(5, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(0), Validators.max(180)],
  });
  private readonly minutesAgoValue = toSignal(this.minutesAgo.valueChanges, {
    initialValue: this.minutesAgo.value,
  });
  readonly minutes = new FormControl(5, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(1), Validators.max(120)],
  });
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });
  readonly retryStart = signal<string | null>(null);
  readonly startPreview = computed(() => {
    const sheet = this.sheet();
    const id =
      sheet?.kind === 'start_round'
        ? sheet.roundId
        : sheet?.kind === 'close_and_start'
          ? sheet.nextId
          : null;
    const round = this.rounds().find((item) => item.id === id);
    if (!round) return null;
    const ago = this.startMode() === 'ago' ? Number(this.minutesAgoValue()) : 0;
    const end = plannedEnd(round, this.clock.now(), validOffset(ago) ? ago : 0);
    return { end: this.time(end), overtime: end <= this.clock.now() };
  });
  readonly searchText = (match: LiveMatch) =>
    [this.gameName(match.game_id), this.location(match.game_id), this.matchup(match)].join(' ');
  readonly track = (match: LiveMatch) => match.id;
  readonly rowStatus = (match: LiveMatch): DsRowStatus => this.status(match);

  constructor() {
    void this.clock.synchronize();
    effect(() => {
      this.reader.source.set({ kind: 'admin', id: this.eventId() });
      this.standings.eventId.set(this.eventId());
      this.sheet.set(null);
      this.saving.set(false);
    });
    effect(() => {
      const rounds = this.rounds();
      if (!rounds.some((round) => round.id === this.selectedId()))
        this.selectedId.set(
          rounds.find((round) => round.status === 'ACTIVE')?.id ??
            rounds.find((round) => round.status === 'DRAFT')?.id ??
            rounds[0]?.id ??
            '',
        );
    });
  }

  name(value: { name_en?: string | null; name_ar?: string | null } | null | undefined) {
    return localizedName(value, this.direction.language());
  }
  roundLabel(round: {
    number: number;
    type: string;
    name_en: string | null;
    name_ar: string | null;
  }) {
    return this.name(round) || `#${round.type === 'OPENING' ? 0 : round.number}`;
  }
  roundTitle(t: (key: string, params?: Record<string, unknown>) => string, roundId: string) {
    const round = this.rounds().find((item) => item.id === roundId);
    if (!round) return '';
    return (
      this.name(round) ||
      (round.type === 'OPENING' ? t('round.opening') : t('player.roundNumber', { n: round.number }))
    );
  }
  status(match: LiveMatch): DsStatus {
    return liveMatchStatus(
      match,
      this.reader.data()?.rounds.find((round) => round.id === match.round_id)?.status,
    );
  }
  game(id: string) {
    return this.reader.data()?.games.find((game) => game.id === id);
  }
  gameName(id: string) {
    return this.name(this.game(id));
  }
  location(id: string) {
    return localizedLocation(this.game(id), this.direction.language());
  }
  referees(gameId: string) {
    return (this.reader.data()?.game_referee_contacts ?? []).filter(
      (contact) => contact.game_id === gameId,
    );
  }
  matchup(match: LiveMatch) {
    return match.participants
      .map(
        (item) =>
          this.name(this.reader.data()?.teams.find((team) => team.id === item.team_id)) ||
          item.team_code,
      )
      .join(' · ');
  }
  matchById(id: string) {
    return this.reader.data()?.matches.find((match) => match.id === id) ?? null;
  }
  pendingIn(roundId: string) {
    return (this.reader.data()?.matches ?? []).filter(
      (match) => match.round_id === roundId && match.status === 'SCHEDULED',
    );
  }
  time(ms: number) {
    return new Intl.DateTimeFormat(this.direction.language() === 'ar' ? 'ar-EG' : 'en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      numberingSystem: 'latn',
    }).format(ms);
  }
  columns(t: (key: string) => string): DsColumn<LiveMatch>[] {
    return [
      { key: 'game', header: t('results.game') },
      { key: 'referee', header: t('results.referee') },
      { key: 'matchup', header: t('results.matchup'), priority: 2, value: (m) => this.matchup(m) },
      { key: 'action', header: t('results.actions'), align: 'end' },
    ];
  }
  openSheet(sheet: Sheet) {
    if (!this.canAdmin() || this.saving()) return;
    this.notice.set('');
    this.reason.reset('');
    this.startMode.set('now');
    this.minutesAgo.reset(5);
    this.minutes.reset(5);
    this.sheet.set(sheet);
  }
  async extend(minutes: number) {
    const round = this.round();
    if (!round) return;
    await this.run('extend_round', { p_round: round.id, p_minutes: minutes });
  }
  private startArgs(roundId: string) {
    const ago = this.startMode() === 'ago' ? Number(this.minutesAgo.value) : 0;
    return ago > 0 ? { p_round: roundId, p_started_minutes_ago: ago } : { p_round: roundId };
  }
  private offsetInvalid() {
    return this.startMode() === 'ago' && !validOffset(Number(this.minutesAgo.value));
  }
  async confirm() {
    const sheet = this.sheet();
    if (!sheet || !this.canAdmin() || this.saving()) return;
    if (sheet.kind === 'start_round') {
      if (this.offsetInvalid()) return this.notice.set('errors.INVALID_START_OFFSET');
      await this.run('start_round', this.startArgs(sheet.roundId), true);
    } else if (sheet.kind === 'extend_round') {
      if (this.minutes.invalid) return this.notice.set('errors.INVALID_MINUTES');
      await this.run(
        'extend_round',
        { p_round: sheet.roundId, p_minutes: this.minutes.value },
        true,
      );
    } else if (sheet.kind === 'close_round') {
      await this.run('close_round', { p_round: sheet.roundId }, true);
    } else if (sheet.kind === 'reopen_round') {
      if (this.reason.invalid || this.reason.value.trim().length < 3) {
        this.reason.markAsTouched();
        return;
      }
      await this.run(
        'reopen_round',
        { p_round: sheet.roundId, p_reason: this.reason.value.trim() },
        true,
      );
    } else if (sheet.kind === 'close_and_start') {
      if (this.offsetInvalid()) return this.notice.set('errors.INVALID_START_OFFSET');
      const args = this.startArgs(sheet.nextId);
      const ended = await this.run('close_round', { p_round: sheet.roundId }, false);
      if (!ended) return;
      const started = await this.run('start_round', args, true);
      if (started) {
        this.notice.set('control.endedAndStarted');
        this.selectedId.set(sheet.nextId);
      } else this.retryStart.set(sheet.nextId);
    }
  }
  async retry() {
    const id = this.retryStart();
    if (!id) return;
    if (await this.run('start_round', { p_round: id }, true)) {
      this.retryStart.set(null);
      this.selectedId.set(id);
    }
  }
  private async run(
    name: 'start_round' | 'extend_round' | 'close_round' | 'reopen_round',
    args: Record<string, unknown>,
    closeSheet = true,
  ): Promise<boolean> {
    this.saving.set(true);
    try {
      const receipt = await this.api.mutate(name, args);
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.saved');
      if (closeSheet) this.sheet.set(null);
      if (receipt.status === 'sent') this.reader.refresh();
      return true;
    } catch (error) {
      this.notice.set(liveErrorKey(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
  saved(status: 'sent' | 'queued') {
    this.notice.set(status === 'queued' ? 'live.queued' : 'live.resultSaved');
    this.sheet.set(null);
    if (status === 'sent') this.reader.refresh();
  }
}
