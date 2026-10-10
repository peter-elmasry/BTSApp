import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthStore, type StaffProfile } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { LiveSnapshot } from '../../core/live/live-types';
import type { QueuedOperation } from '../../core/offline/offline-db';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { LiveReader } from '../live/live-reader';
import { MatchEntryPage } from './match-entry-page';

describe('match result confirmation safety', () => {
  const snapshot = {
    event: { id: 'event' },
    teams: [],
    games: [],
    adjustments: [],
    rounds: [{ id: 'round', type: 'REGULAR', status: 'ACTIVE' }],
    matches: [
      {
        id: 'match',
        round_id: 'round',
        game_id: 'game',
        status: 'SCHEDULED',
        participants: [
          { team_id: 'a', outcome: 'PENDING', side: 'A' },
          { team_id: 'b', outcome: 'PENDING', side: 'B' },
        ],
      },
    ],
  } as unknown as LiveSnapshot;
  const profile = signal<StaffProfile | null>(null);
  const operations = signal<QueuedOperation[]>([]);
  const queueReady = signal(true);
  const api = { mutate: vi.fn() };
  const reader = {
    data: signal<LiveSnapshot | null>(snapshot),
    source: signal<unknown>(null),
    refresh: vi.fn(),
  };
  let page: MatchEntryPage;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    vi.clearAllMocks();
    profile.set({
      id: 'owner',
      system_role: 'OWNER',
      roles: [],
      assigned_games: [],
    } as unknown as StaffProfile);
    operations.set([]);
    queueReady.set(true);
    reader.data.set(snapshot);
    api.mutate.mockResolvedValue({ status: 'sent', opId: 'operation' });
    params = new BehaviorSubject(convertToParamMap({ id: 'match' }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthStore,
          useValue: { profile, session: signal({ user: { id: 'auth-owner' } }) },
        },
        { provide: DirectionService, useValue: { language: signal('en') } },
        { provide: LiveApi, useValue: api },
        { provide: LiveReader, useValue: reader },
        {
          provide: OpQueueService,
          useValue: { operations, ready: queueReady, pending: computed(() => operations().length) },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params.asObservable(), snapshot: { paramMap: params.value } },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new MatchEntryPage());
    TestBed.tick();
  });

  it('does not send a selected result until its summary is explicitly confirmed', async () => {
    page.select('aWins');
    await page.submit();
    expect(api.mutate).not.toHaveBeenCalled();
    page.review();
    await page.submit();
    expect(api.mutate).toHaveBeenCalledExactlyOnceWith('submit_match_result', {
      p_match: 'match',
      p_outcomes: [
        { team_id: 'a', outcome: 'WIN' },
        { team_id: 'b', outcome: 'LOSS' },
      ],
    });
    expect(reader.refresh).toHaveBeenCalledOnce();
  });

  it('rejects a stale confirmation after the draft result changes', async () => {
    page.select('aWins');
    page.review();
    page.select('draw');
    await page.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('blocks review and submission while persisted operations are still restoring', async () => {
    page.select('aWins');
    queueReady.set(false);
    page.review();
    expect(page.confirmation()).toBeNull();
    queueReady.set(true);
    page.review();
    expect(page.confirmation()).not.toBeNull();
    queueReady.set(false);
    await page.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('clears confirmation when navigating to a different match in the reused component', async () => {
    page.select('aWins');
    page.review();
    params.next(convertToParamMap({ id: 'other-match' }));
    TestBed.tick();
    expect(page.confirmation()).toBeNull();
    await page.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('blocks another submission when this match already has a persisted queued result', async () => {
    operations.set([
      {
        id: 'operation',
        actor: 'auth-owner',
        name: 'submit_match_result',
        args: { p_match: 'match' },
        createdAt: 0,
        attempts: 0,
        nextAttempt: 0,
      },
    ]);
    page.select('aWins');
    page.review();
    expect(page.queued()).toBe(true);
    expect(page.confirmation()).toBeNull();
    await page.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('clears confirmation and blocks submission when permission changes', async () => {
    page.select('aWins');
    page.review();
    profile.set(null);
    TestBed.tick();
    expect(page.confirmation()).toBeNull();
    await page.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });
});
