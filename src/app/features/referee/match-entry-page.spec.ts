import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthStore, type StaffProfile } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { LiveMatch, LiveSnapshot } from '../../core/live/live-types';
import type { QueuedOperation } from '../../core/offline/offline-db';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { LiveReader } from '../live/live-reader';
import { ResultEntry } from '../live/result-entry';
import { MatchEntryPage } from './match-entry-page';

const match = (id: string) =>
  ({
    id,
    round_id: 'round',
    game_id: 'game',
    status: 'SCHEDULED',
    participants: [
      { team_id: 'a', outcome: 'PENDING', side: 'A' },
      { team_id: 'b', outcome: 'PENDING', side: 'B' },
    ],
  }) as unknown as LiveMatch;
const snapshot = {
  event: { id: 'event' },
  teams: [],
  games: [],
  adjustments: [],
  rounds: [{ id: 'round', type: 'REGULAR', status: 'ACTIVE' }],
  matches: [match('match'), match('other-match')],
} as unknown as LiveSnapshot;

describe('match result confirmation safety', () => {
  const profile = signal<StaffProfile | null>(null);
  const operations = signal<QueuedOperation[]>([]);
  const queueReady = signal(true);
  const api = { mutate: vi.fn() };
  const reader = {
    data: signal<LiveSnapshot | null>(snapshot),
    source: signal<unknown>(null),
    refresh: vi.fn(),
  };
  const navigate = vi.fn();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let fixture: ComponentFixture<ResultEntry>;
  let entry: ResultEntry;
  let saved: string[];

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
        { provide: Router, useValue: { navigate } },
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
    TestBed.overrideComponent(ResultEntry, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(ResultEntry);
    fixture.componentRef.setInput('snapshot', snapshot);
    fixture.componentRef.setInput('match', snapshot.matches[0]);
    entry = fixture.componentInstance;
    saved = [];
    entry.saved.subscribe((status) => saved.push(status));
    fixture.detectChanges();
  });

  it('does not send a selected result until its summary is explicitly confirmed', async () => {
    entry.select('aWins');
    await entry.submit();
    expect(api.mutate).not.toHaveBeenCalled();
    entry.review();
    await entry.submit();
    expect(api.mutate).toHaveBeenCalledExactlyOnceWith('submit_match_result', {
      p_match: 'match',
      p_outcomes: [
        { team_id: 'a', outcome: 'WIN' },
        { team_id: 'b', outcome: 'LOSS' },
      ],
    });
    expect(saved).toEqual(['sent']);
  });

  it('rejects a stale review after the draft result changes', async () => {
    entry.select('aWins');
    entry.review();
    entry.select('draw');
    await entry.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('blocks review and submission while persisted operations are still restoring', async () => {
    entry.select('aWins');
    queueReady.set(false);
    entry.review();
    expect(entry.reviewing()).toBe(false);
    queueReady.set(true);
    entry.review();
    expect(entry.reviewing()).toBe(true);
    queueReady.set(false);
    await entry.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('clears the review when the component is reused for a different match', async () => {
    entry.select('aWins');
    entry.review();
    fixture.componentRef.setInput('match', snapshot.matches[1]);
    fixture.detectChanges();
    expect(entry.reviewing()).toBe(false);
    await entry.submit();
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
    entry.select('aWins');
    entry.review();
    expect(entry.queued()).toBe(true);
    expect(entry.reviewing()).toBe(false);
    await entry.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('clears the review and blocks submission when permission changes', async () => {
    entry.select('aWins');
    entry.review();
    profile.set(null);
    fixture.detectChanges();
    expect(entry.reviewing()).toBe(false);
    await entry.submit();
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('returns to the station after a confirmed result and stays while it is queued', () => {
    const page = TestBed.runInInjectionContext(() => new MatchEntryPage());
    TestBed.tick();
    page.saved('queued');
    expect(navigate).not.toHaveBeenCalled();
    page.saved('sent');
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/ref'], {
      queryParams: { saved: 'match' },
    });
  });
});
