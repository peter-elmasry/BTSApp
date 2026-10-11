import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import { AuthStore, type StaffProfile } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { EventChannelService } from '../../core/realtime/event-channel.service';
import { StandingsApi } from '../../core/standings/standings-api';
import type { StandingsExport } from '../../core/standings/standings-types';
import { ExportWorkbookService } from './export-workbook-service';
import { ManageStandingsPage } from './manage-standings-page';

function fixture(): StandingsExport {
  return {
    event: { id: 'event', leaderboard_public: false },
    generated_at: '2026-01-10T12:00:00Z',
    standings: ['a', 'b', 'c'].map((id) => ({
      rank: 1,
      team: { id, code: id, name_en: id.toUpperCase(), name_ar: null },
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      forfeits: 0,
      match_points: 0,
      adjustment_points: 0,
      total: 0,
      is_tied: true,
      final_tiebreak_pos: null,
    })),
    matches: [],
    adjustments: [],
    staff: [],
  } as unknown as StandingsExport;
}

describe('admin standings confirmation and export safety', () => {
  let page: ManageStandingsPage;
  let snapshot: StandingsExport;
  const profile = signal<StaffProfile | null>(null);
  const session = signal<{ user: { id: string } } | null>({ user: { id: 'auth-owner' } });
  const ready = signal(true);
  const channelRevision = signal(0);
  const updates = signal(0);
  const api = { export: vi.fn(), visibility: vi.fn(), tiebreak: vi.fn() };
  const workbook = { prepare: vi.fn(), download: vi.fn() };
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function settle() {
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    snapshot = fixture();
    profile.set({ id: 'owner', system_role: 'OWNER', roles: [] } as unknown as StaffProfile);
    session.set({ user: { id: 'auth-owner' } });
    ready.set(true);
    channelRevision.set(0);
    updates.set(0);
    api.export.mockResolvedValue(snapshot);
    api.visibility.mockResolvedValue({ status: 'sent', opId: 'op' });
    api.tiebreak.mockResolvedValue({ status: 'sent', opId: 'op' });
    workbook.prepare.mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'standings.xlsx' });
    params = new BehaviorSubject(convertToParamMap({ eventId: 'event' }));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { profile, session } },
        { provide: DirectionService, useValue: { language: signal('en') } },
        { provide: StandingsApi, useValue: api },
        { provide: ExportWorkbookService, useValue: workbook },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
        { provide: OpQueueService, useValue: { ready, operations: signal([]) } },
        {
          provide: EventChannelService,
          useValue: { revision: channelRevision, acquire: vi.fn(() => () => {}) },
        },
        { provide: ReadCacheService, useValue: { updates } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params.asObservable(), snapshot: { paramMap: params.value } },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new ManageStandingsPage());
    await settle();
  });

  it('requires explicit visibility confirmation and does not claim a queued change is public', async () => {
    page.openVisibility();
    expect(api.visibility).not.toHaveBeenCalled();
    expect(page.action()).toEqual({ kind: 'visibility', value: true });
    api.visibility.mockResolvedValueOnce({ status: 'queued', opId: 'op' });
    await page.confirmAction();
    expect(api.visibility).toHaveBeenCalledExactlyOnceWith('event', true);
    expect(page.notice()).toBe('phase6.queued');
    expect(page.snapshot()?.event.leaderboard_public).toBe(false);
  });

  it('blocks edits while the durable operation queue is still restoring', async () => {
    ready.set(false);
    page.openVisibility();
    page.openTie(0);
    expect(page.action()).toBeNull();
    await page.confirmAction();
    expect(api.visibility).not.toHaveBeenCalled();
    expect(api.tiebreak).not.toHaveBeenCalled();
  });

  it('submits the entire tied group in the chosen accessible order', async () => {
    page.openTie(0);
    page.move('c', -2);
    expect(api.tiebreak).not.toHaveBeenCalled();
    await page.confirmAction();
    expect(api.tiebreak).toHaveBeenCalledExactlyOnceWith('event', ['c', 'a', 'b']);
  });

  it('discards a stale tie draft after totals change on refresh', async () => {
    page.openTie(0);
    const changed = structuredClone(snapshot);
    changed.standings[0].total = 2;
    api.export.mockResolvedValue(changed);
    channelRevision.update((value) => value + 1);
    await settle();
    expect(page.action()).toBeNull();
    expect(page.notice()).toBe('phase6.tieChanged');
    await page.confirmAction();
    expect(api.tiebreak).not.toHaveBeenCalled();
  });

  it('freezes a fresh export preview and downloads the identical snapshot despite realtime changes', async () => {
    const fresh = structuredClone(snapshot);
    fresh.generated_at = '2026-01-10T13:00:00Z';
    fresh.standings[0].total = 3;
    api.export.mockResolvedValueOnce(fresh);
    await page.prepareExport();
    await settle();
    const calls = api.export.mock.calls.length;
    channelRevision.update((value) => value + 1);
    updates.update((value) => value + 1);
    await settle();
    expect(api.export).toHaveBeenCalledTimes(calls);
    expect(page.snapshot()).toBe(fresh);
    await page.download();
    expect(workbook.prepare.mock.calls[0][0]).toBe(fresh);
    expect(workbook.download).toHaveBeenCalledOnce();
  });

  it('hides previous admin data immediately on logout and ignores a late response', async () => {
    let resolve!: (snapshot: StandingsExport) => void;
    api.export.mockReturnValueOnce(
      new Promise<StandingsExport>((done) => {
        resolve = done;
      }),
    );
    const loading = page.prepareExport();
    session.set(null);
    profile.set(null);
    expect(page.snapshot()).toBeNull();
    resolve(snapshot);
    await loading;
    await settle();
    expect(page.snapshot()).toBeNull();
    expect(page.action()).toBeNull();
  });

  it('does not download privileged data if authorization changes while ExcelJS is preparing it', async () => {
    await page.prepareExport();
    let resolve!: (file: { blob: Blob; filename: string }) => void;
    workbook.prepare.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const downloading = page.download();
    profile.set(null);
    resolve({ blob: new Blob(['xlsx']), filename: 'standings.xlsx' });
    await downloading;
    expect(workbook.download).not.toHaveBeenCalled();
  });

  it('cannot confirm a draft after route navigation to another event', async () => {
    page.openVisibility();
    params.next(convertToParamMap({ eventId: 'other-event' }));
    expect(page.snapshot()).toBeNull();
    await page.confirmAction();
    expect(api.visibility).not.toHaveBeenCalled();
  });
});
