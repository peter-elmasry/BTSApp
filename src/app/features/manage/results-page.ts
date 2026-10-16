import { ToastService } from '../../shared/ui/toast';
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
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { LiveMatch } from '../../core/live/live-types';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import {
  DsCellDef,
  DsDataTable,
  type DsColumn,
  type DsRowStatus,
} from '../../shared/ui/data-table';
import { DsOutcome } from '../../shared/ui/outcome';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { DsStatusPill, type DsStatus } from '../../shared/ui/status-pill';
import { DsTabs, type DsTabItem } from '../../shared/ui/tabs';
import { isLiveAdmin, liveErrorKey, liveMatchStatus, sortForChase } from '../live/live-helpers';
import { LiveReader } from '../live/live-reader';
import { ResultEntry } from '../live/result-entry';
import { localizedLocation, localizedName } from '../public/public-helpers';
import { TeamBreakdownSheet } from '../standings/team-breakdown-sheet';

export { liveMatchStatus, sortForChase };

type Action = { kind: 'entry' | 'reset' | 'void'; match: LiveMatch };

@Component({
  selector: 'app-results-page',
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    DsBottomSheet,
    DsDataTable,
    DsCellDef,
    DsOutcome,
    DsPhoneLink,
    DsStatusPill,
    DsTabs,
    ResultEntry,
    TeamBreakdownSheet,
  ],
  providers: [LiveReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './results-page.html',
})
export class ResultsPage {
  private readonly toast = inject(ToastService);
  readonly reader = inject(LiveReader);
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  readonly direction = inject(DirectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly eventId = computed(() => this.params().get('eventId') ?? '');
  readonly canAdmin = computed(
    () => !!this.reader.data() && isLiveAdmin(this.auth.profile(), this.eventId()),
  );
  readonly rounds = computed(() =>
    [...(this.reader.data()?.rounds ?? [])].sort((a, b) => a.number - b.number),
  );
  readonly selectedId = signal('');
  readonly roundTabs = computed<DsTabItem[]>(() =>
    this.rounds().map((round) => {
      const late = this.reader
        .data()!
        .matches.filter(
          (match) => match.round_id === round.id && liveMatchStatus(match, round.status) === 'late',
        ).length;
      return { id: round.id, label: this.roundLabel(round), badge: late || null };
    }),
  );
  readonly selectedRound = computed(() =>
    this.rounds().find((round) => round.id === this.selectedId()),
  );
  readonly rows = computed(() =>
    sortForChase(
      (this.reader.data()?.matches ?? []).filter((match) => match.round_id === this.selectedId()),
      (match) => this.status(match),
      (match) => this.game(match.game_id)?.code ?? '',
    ),
  );
  readonly action = signal<Action | null>(null);
  readonly drill = signal<string | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });
  readonly searchText = (match: LiveMatch) =>
    [
      this.name(this.game(match.game_id)),
      this.location(match.game_id),
      ...match.participants.map((item) => this.name(this.team(item.team_id)) || item.team_code),
      ...this.referees(match.game_id).map((item) => this.name(item)),
    ].join(' ');
  readonly track = (match: LiveMatch) => match.id;
  readonly rowStatus = (match: LiveMatch): DsRowStatus => this.status(match);

  constructor() {
    effect(() => this.reader.source.set({ kind: 'admin', id: this.eventId() }));
    effect(() => {
      const rounds = this.rounds();
      if (!rounds.some((round) => round.id === this.selectedId()))
        this.selectedId.set(
          rounds.find((round) => round.status === 'ACTIVE')?.id ??
            [...rounds].reverse().find((round) => round.status === 'CLOSED')?.id ??
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
  game(id: string) {
    return this.reader.data()?.games.find((game) => game.id === id);
  }
  location(id: string) {
    return localizedLocation(this.game(id), this.direction.language());
  }
  referees(gameId: string) {
    return (this.reader.data()?.game_referee_contacts ?? []).filter(
      (contact) => contact.game_id === gameId,
    );
  }
  team(id: string) {
    return this.reader.data()?.teams.find((team) => team.id === id);
  }
  enteredBy(match: LiveMatch) {
    if (!match.result_entered_at) return '—';
    const who =
      this.referees(match.game_id).find((item) => item.member_id === match.result_entered_by) ??
      null;
    const at = new Date(match.result_entered_at).toLocaleTimeString(
      this.direction.language() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
      { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' },
    );
    return who ? `${this.name(who)} · ${at}` : at;
  }
  status(match: LiveMatch): DsStatus {
    return liveMatchStatus(
      match,
      this.reader.data()?.rounds.find((round) => round.id === match.round_id)?.status,
    );
  }
  columns(t: (key: string) => string): DsColumn<LiveMatch>[] {
    return [
      { key: 'game', header: t('results.game') },
      { key: 'matchup', header: t('results.matchup') },
      { key: 'status', header: t('results.status') },
      { key: 'referee', header: t('results.referee'), priority: 2 },
      {
        key: 'entered',
        header: t('results.entered'),
        priority: 3,
        value: (m) => this.enteredBy(m),
      },
      { key: 'actions', header: t('results.actions'), align: 'end' },
    ];
  }
  open(kind: Action['kind'], match: LiveMatch) {
    if (!this.canAdmin()) return;
    this.reason.reset('');
    this.notice.set('');
    this.action.set({ kind, match });
  }
  openTeam(code: string) {
    this.drill.set(code);
  }
  saved(status: 'sent' | 'queued') {
    this.notice.set(status === 'queued' ? 'live.queued' : 'live.resultSaved');
    this.toast.show(this.notice());
    this.action.set(null);
    if (status === 'sent') this.reader.refresh();
  }
  async confirm() {
    const action = this.action();
    if (!action || action.kind === 'entry' || !this.canAdmin() || this.saving()) return;
    if (action.kind === 'void' && (this.reason.invalid || this.reason.value.trim().length < 3)) {
      this.reason.markAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const receipt = await this.api.mutate(
        action.kind === 'void' ? 'void_match' : 'reset_match_result',
        action.kind === 'void'
          ? { p_match: action.match.id, p_reason: this.reason.value.trim() }
          : { p_match: action.match.id },
      );
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.saved');
      this.toast.show(this.notice());
      this.action.set(null);
      if (receipt.status === 'sent') this.reader.refresh();
    } catch (error) {
      this.notice.set(liveErrorKey(error));
    } finally {
      this.saving.set(false);
    }
  }
}
