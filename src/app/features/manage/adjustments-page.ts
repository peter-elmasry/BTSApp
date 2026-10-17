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
import type { LiveAdjustment } from '../../core/live/live-types';
import { StandingsReader } from '../../core/standings/standings-reader';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { DsSearchSelect } from '../../shared/ui/search-select';
import {
  DsCellDef,
  DsDataTable,
  type DsColumn,
  type DsRowStatus,
} from '../../shared/ui/data-table';
import { AdjustmentsPanel } from '../live/adjustments-panel';
import { AdjustmentEditor } from '../live/adjustment-editor';
import { canManageAdjustment, isLiveAdmin, liveErrorKey } from '../live/live-helpers';
import { LiveReader } from '../live/live-reader';
import { localizedName } from '../public/public-helpers';
import { TeamBreakdownSheet } from '../standings/team-breakdown-sheet';

export interface AdjustmentFilter {
  scope: 'ALL' | 'MATCH' | 'EVENT';
  team: string;
  revoked: boolean;
}

export function filterAdjustments(items: readonly LiveAdjustment[], filter: AdjustmentFilter) {
  return items
    .filter(
      (item) =>
        (filter.scope === 'ALL' || item.scope === filter.scope) &&
        (!filter.team || item.team_id === filter.team) &&
        (filter.revoked || !item.revoked_at),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

@Component({
  selector: 'app-adjustments-page',
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    DsBottomSheet,
    DsDataTable,
    DsCellDef,
    AdjustmentsPanel,
    AdjustmentEditor,
    TeamBreakdownSheet,
    DsSearchSelect,
  ],
  providers: [LiveReader, StandingsReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustments-page.html',
})
export class AdjustmentsPage {
  private readonly toast = inject(ToastService);
  readonly reader = inject(LiveReader);
  private readonly standings = inject(StandingsReader);
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
  readonly scope = signal<AdjustmentFilter['scope']>('ALL');
  readonly team = signal('');
  readonly revoked = signal(false);
  readonly rows = computed(() =>
    filterAdjustments(this.reader.data()?.adjustments ?? [], {
      scope: this.scope(),
      team: this.team(),
      revoked: this.revoked(),
    }),
  );
  readonly totals = computed(
    () => new Map(this.standings.rows().map((row) => [row.team.id, row.total])),
  );
  readonly adding = signal(false);
  readonly revokeTarget = signal<LiveAdjustment | null>(null);
  readonly drill = signal<string | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly revokeReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });
  readonly teamOptions = computed(() =>
    (this.reader.data()?.teams ?? []).map((team) => ({ value: team.id, label: this.name(team) })),
  );
  readonly searchText = (item: LiveAdjustment) =>
    [this.name(this.teamOf(item)), item.reason, this.name(item.given_by)].join(' ');
  readonly track = (item: LiveAdjustment) => item.id;
  readonly rowStatus = (item: LiveAdjustment): DsRowStatus => (item.revoked_at ? 'void' : null);

  constructor() {
    effect(() => {
      this.reader.source.set({ kind: 'admin', id: this.eventId() });
      this.standings.eventId.set(this.eventId());
    });
  }

  name(value: { name_en?: string | null; name_ar?: string | null } | null | undefined) {
    return localizedName(value, this.direction.language());
  }
  teamOf(item: LiveAdjustment) {
    return this.reader.data()?.teams.find((team) => team.id === item.team_id);
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
  columns(t: (key: string) => string): DsColumn<LiveAdjustment>[] {
    return [
      { key: 'team', header: t('adjustments.team') },
      {
        key: 'points',
        header: t('adjustments.points'),
        numeric: true,
        value: (item) => this.signed(item.points),
      },
      { key: 'reason', header: t('adjustments.reason'), value: (item) => item.reason },
      {
        key: 'scope',
        header: t('adjustments.scope'),
        priority: 2,
        value: (item) => t('player.adjustmentScope.' + item.scope),
      },
      {
        key: 'by',
        header: t('adjustments.by'),
        priority: 2,
        value: (item) => this.name(item.given_by),
      },
      {
        key: 'time',
        header: t('adjustments.time'),
        priority: 3,
        value: (item) => this.time(item.created_at),
      },
      { key: 'actions', header: t('results.actions'), align: 'end' },
    ];
  }
  changed() {
    this.reader.refresh();
    this.standings.refresh();
  }
  openRevoke(item: LiveAdjustment) {
    if (!this.canManage(item)) return;
    this.revokeReason.reset('');
    this.revokeTarget.set(item);
  }
  async revoke() {
    const item = this.revokeTarget();
    if (!item || !this.canManage(item) || this.saving()) return;
    if (this.revokeReason.invalid || this.revokeReason.value.trim().length < 3) {
      this.revokeReason.markAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const receipt = await this.api.mutate('revoke_adjustment', {
        p_adjustment: item.id,
        p_reason: this.revokeReason.value.trim(),
      });
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.saved');
      this.toast.show(this.notice());
      this.revokeTarget.set(null);
      if (receipt.status === 'sent') this.changed();
    } catch (error) {
      this.notice.set(liveErrorKey(error));
    } finally {
      this.saving.set(false);
    }
  }
  canManage(item: LiveAdjustment) {
    return canManageAdjustment(this.auth.profile(), this.eventId(), item);
  }
}
