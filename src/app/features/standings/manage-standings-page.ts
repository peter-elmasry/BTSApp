import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { rpcFailure } from '../../core/offline/rpc-errors';
import { EventChannelService } from '../../core/realtime/event-channel.service';
import { StandingsApi } from '../../core/standings/standings-api';
import { ExportSheet } from './export-sheet';
import { TeamBreakdownSheet } from './team-breakdown-sheet';
import type { StandingRow, StandingsExport } from '../../core/standings/standings-types';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { isLiveAdmin } from '../live/live-helpers';
import { localizedName } from '../public/public-helpers';
import { cairoExportTime } from './export-workbook';
import { ExportWorkbookService } from './export-workbook-service';

type TieGroup = { total: number; rows: StandingRow[] };
type Action =
  | { kind: 'visibility'; value: boolean }
  | { kind: 'tie'; total: number; ids: string[]; signature: string };

export function unresolvedTies(rows: StandingRow[]): TieGroup[] {
  const groups = new Map<number, StandingRow[]>();
  for (const row of rows) groups.set(row.total, [...(groups.get(row.total) ?? []), row]);
  return [...groups]
    .filter(([, group]) => group.length > 1 && group.some((row) => row.is_tied))
    .map(([total, group]) => ({ total, rows: group }));
}
function tieSignature(rows: StandingRow[], total: number) {
  return JSON.stringify(
    rows
      .filter((row) => row.total === total)
      .map((row) => [row.team.id, row.total, row.final_tiebreak_pos])
      .sort(),
  );
}
export function standingsAdminError(error: unknown) {
  const failure = rpcFailure(error);
  const codes = [
    'FORBIDDEN',
    'NOT_FOUND',
    'OP_ID_CONFLICT',
    'INVALID_OP_ID',
    'OFFLINE_STORAGE_UNAVAILABLE',
    'UNAUTHENTICATED',
  ];
  const code = codes.find((value) => failure.code === value || failure.message === value);
  if (code) return `errors.${code}`;
  if ([failure.code, failure.message].some((value) => /TIE|TEAM_IDS/.test(value ?? '')))
    return 'phase6.tieChanged';
  return 'phase6.requestFailed';
}

@Component({
  selector: 'app-manage-standings-page',
  imports: [TranslocoDirective, DsBottomSheet, ExportSheet, TeamBreakdownSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './manage-standings-page.html',
})
export class ManageStandingsPage {
  private readonly api = inject(StandingsApi);
  private readonly auth = inject(AuthStore);
  private readonly realtime = inject(EventChannelService);
  private readonly cache = inject(ReadCacheService);
  private readonly queue = inject(OpQueueService);
  private readonly workbook = inject(ExportWorkbookService);
  private readonly translation = inject(TranslocoService);
  readonly direction = inject(DirectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly eventId = computed(() => this.params().get('eventId') ?? '');
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private exportRequested = false;
  readonly allowed = computed(
    () => !!this.auth.session() && isLiveAdmin(this.auth.profile(), this.eventId()),
  );
  private readonly context = computed(() =>
    JSON.stringify([
      this.eventId(),
      this.auth.session()?.user.id,
      this.auth.profile()?.id,
      this.auth.profile()?.system_role,
      this.auth.profile()?.roles,
    ]),
  );
  private readonly result = signal<StandingsExport | null>(null);
  private readonly responseContext = signal('');
  readonly snapshot = computed(() =>
    this.allowed() && this.context() === this.responseContext() ? this.result() : null,
  );
  readonly ties = computed(() => unresolvedTies(this.snapshot()?.standings ?? []));
  readonly pending = computed(() =>
    this.queue
      .operations()
      .some(
        (operation) =>
          operation.args['p_event'] === this.eventId() &&
          ['set_tiebreak', 'set_leaderboard_visibility'].includes(operation.name),
      ),
  );
  readonly ready = this.queue.ready;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly preview = signal(false);
  readonly exportSheet = signal(false);
  readonly drill = signal<string | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly action = signal<Action | null>(null);
  readonly name = localizedName;
  readonly cairoTime = cairoExportTime;
  private readonly revision = signal(0);
  private request = 0;
  private actionVersion = 0;
  private dragId: string | null = null;

  constructor() {
    // "Preview first" in the Export sheet (D045) opens this page with a frozen preview.
    effect(() => {
      if (this.query().get('preview') !== '1' || this.exportRequested) return;
      if (!this.snapshot() || this.loading() || this.preview()) return;
      this.exportRequested = true;
      untracked(() => void this.prepareExport());
    });
    effect((cleanup) => {
      const id = this.eventId();
      if (id && this.allowed()) cleanup(this.realtime.acquire(id));
    });
    effect(() => {
      this.context();
      this.actionVersion++;
      this.action.set(null);
      this.saving.set(false);
      this.exporting.set(false);
      this.preview.set(false);
      this.notice.set('');
      this.dragId = null;
    });
    effect(() => {
      this.context();
      const allowed = this.allowed();
      this.realtime.revision();
      this.cache.updates();
      this.revision();
      const preview = this.preview();
      if (!allowed) {
        this.request++;
        this.result.set(null);
        this.loading.set(false);
        this.error.set('errors.FORBIDDEN');
        return;
      }
      if (!preview) untracked(() => void this.load());
    });
  }
  refresh() {
    this.preview.set(false);
    this.revision.update((value) => value + 1);
  }
  private async load() {
    const request = ++this.request;
    const context = this.context();
    const id = this.eventId();
    this.loading.set(true);
    this.error.set('');
    try {
      const snapshot = await this.api.export(id);
      if (request !== this.request || context !== this.context() || !this.allowed()) return false;
      if (snapshot.event.id !== id) throw new Error('INVALID_EXPORT_EVENT');
      const action = this.action();
      if (
        action?.kind === 'tie' &&
        action.signature !== tieSignature(snapshot.standings, action.total)
      ) {
        this.action.set(null);
        this.notice.set('phase6.tieChanged');
      }
      this.responseContext.set(context);
      this.result.set(snapshot);
      return true;
    } catch (error) {
      if (request === this.request && context === this.context()) {
        this.result.set(null);
        this.error.set(standingsAdminError(error));
      }
      return false;
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  openVisibility() {
    const snapshot = this.snapshot();
    if (!snapshot || !this.canMutate()) return;
    this.action.set({ kind: 'visibility', value: !snapshot.event.leaderboard_public });
  }
  openTie(total: number) {
    if (!this.canMutate()) return;
    const group = this.ties().find((group) => group.total === total);
    if (!group) return;
    this.action.set({
      kind: 'tie',
      total,
      ids: group.rows.map((row) => row.team.id),
      signature: tieSignature(this.snapshot()!.standings, total),
    });
  }
  canMutate() {
    return (
      this.allowed() &&
      this.ready() &&
      !this.pending() &&
      !this.saving() &&
      !this.loading() &&
      !this.preview() &&
      !this.exporting()
    );
  }
  teamName(id: string) {
    return localizedName(
      this.snapshot()?.standings.find((row) => row.team.id === id)?.team,
      this.direction.language(),
    );
  }
  move(id: string, delta: number) {
    const action = this.action();
    if (action?.kind !== 'tie' || this.saving()) return;
    const ids = [...action.ids];
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    this.action.set({ ...action, ids });
  }
  dragStart(event: DragEvent, id: string) {
    this.dragId = id;
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  dragOver(event: DragEvent) {
    if (this.dragId) event.preventDefault();
  }
  drop(event: DragEvent, id: string) {
    event.preventDefault();
    const action = this.action();
    const from = action?.kind === 'tie' ? action.ids.indexOf(this.dragId ?? '') : -1;
    const to = action?.kind === 'tie' ? action.ids.indexOf(id) : -1;
    if (from >= 0 && to >= 0) this.move(this.dragId!, to - from);
    this.dragId = null;
  }
  async confirmAction() {
    const action = this.action();
    const snapshot = this.snapshot();
    if (!action || !snapshot || !this.canMutate()) return;
    if (
      action.kind === 'tie' &&
      action.signature !== tieSignature(snapshot.standings, action.total)
    ) {
      this.action.set(null);
      this.notice.set('phase6.tieChanged');
      return;
    }
    const context = this.context();
    const version = ++this.actionVersion;
    this.saving.set(true);
    try {
      const receipt =
        action.kind === 'tie'
          ? await this.api.tiebreak(this.eventId(), [...action.ids])
          : await this.api.visibility(this.eventId(), action.value);
      if (version !== this.actionVersion || context !== this.context() || !this.allowed()) return;
      this.action.set(null);
      this.notice.set(receipt.status === 'queued' ? 'phase6.queued' : 'phase6.saved');
      if (receipt.status === 'sent') this.refresh();
    } catch (error) {
      if (version === this.actionVersion && context === this.context()) {
        this.notice.set(standingsAdminError(error));
        this.action.set(null);
        this.refresh();
      }
    } finally {
      if (version === this.actionVersion) this.saving.set(false);
    }
  }
  async prepareExport() {
    if (!this.allowed() || this.saving() || this.exporting() || this.loading()) return;
    this.action.set(null);
    this.preview.set(true);
    if (!(await this.load())) this.preview.set(false);
  }
  async download() {
    const snapshot = this.snapshot();
    if (!snapshot || !this.allowed() || !this.preview() || this.exporting() || this.loading())
      return;
    const context = this.context();
    this.exporting.set(true);
    try {
      const language = this.direction.language();
      const file = await this.workbook.prepare(snapshot, language, (key) =>
        this.translation.translate(key, {}, language),
      );
      if (
        context !== this.context() ||
        !this.allowed() ||
        snapshot !== this.snapshot() ||
        !this.preview()
      )
        return;
      this.workbook.download(file);
      this.notice.set('phase6.downloaded');
    } catch (error) {
      if (context === this.context()) this.notice.set(standingsAdminError(error));
    } finally {
      if (context === this.context()) this.exporting.set(false);
    }
  }
}
