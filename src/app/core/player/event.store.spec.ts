import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { EventStore, canSeeAllOutcomes, redactMatchOutcomes } from './event.store';
import { PublicApi } from './public-api';
import type { PublicEvent, PublicMatch } from './public-types';
import { ReadCacheService } from '../offline/read-cache.service';
import { EventChannelService } from '../realtime/event-channel.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const event = (id: string) => ({ id, name_en: id }) as PublicEvent;

describe('public event state', () => {
  const session = signal<{ user: { id: string } } | null>(null);
  const profile = signal<{ system_role: string; roles: unknown[] } | null>(null);
  const auth = { session, profile, initialize: vi.fn(async () => {}) };
  const api = { currentEvent: vi.fn(), bootstrap: vi.fn(), schedule: vi.fn() };
  beforeEach(() => {
    session.set(null);
    profile.set(null);
    auth.initialize.mockReset().mockResolvedValue(undefined);
    api.currentEvent.mockReset().mockResolvedValue(event('one'));
    api.bootstrap.mockReset().mockResolvedValue({ teams: [], games: [], rounds: [] });
    api.schedule.mockReset().mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        { provide: PublicApi, useValue: api },
        { provide: ReadCacheService, useValue: { updates: signal(0) } },
        { provide: EventChannelService, useValue: { revision: signal(0) } },
      ],
    });
  });

  it('deduplicates initialization and waits for restored authentication', async () => {
    const ready = deferred<void>();
    auth.initialize.mockReturnValue(ready.promise);
    const store = TestBed.inject(EventStore);
    const first = store.initialize();
    expect(store.initialize()).toBe(first);
    await settle();
    expect(api.currentEvent).not.toHaveBeenCalled();
    session.set({ user: { id: 'owner' } });
    ready.resolve();
    await first;
    expect(api.currentEvent).toHaveBeenCalledOnce();
    expect(store.event()?.id).toBe('one');
    expect(store.loaded()).toBe(true);
    await store.initialize();
    expect(api.currentEvent).toHaveBeenCalledOnce();
  });

  it('handles no current event without requesting its setup', async () => {
    api.currentEvent.mockResolvedValue(null);
    const store = TestBed.inject(EventStore);
    await store.initialize();
    expect(store.event()).toBeNull();
    expect(store.loaded()).toBe(true);
    expect(store.error()).toBeNull();
    expect(api.bootstrap).not.toHaveBeenCalled();
    expect(api.schedule).not.toHaveBeenCalled();
  });

  it('reports load failures and permits an initialization retry', async () => {
    api.schedule.mockRejectedValueOnce(new Error('offline'));
    const store = TestBed.inject(EventStore);
    await store.initialize();
    expect(store.loading()).toBe(false);
    expect(store.loaded()).toBe(false);
    expect(store.error()).toBe('LOAD_FAILED');
    expect(store.event()).toBeNull();
    await store.initialize();
    expect(store.error()).toBeNull();
    expect(store.loaded()).toBe(true);
  });

  it('discards older refresh responses when a newer event has loaded', async () => {
    const older = deferred<PublicEvent | null>();
    const newer = deferred<PublicEvent | null>();
    api.currentEvent.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const store = TestBed.inject(EventStore);
    const first = store.refresh();
    await settle();
    const second = store.refresh();
    await settle();
    newer.resolve(event('new'));
    await second;
    older.resolve(event('old'));
    await first;
    expect(store.event()?.id).toBe('new');
    expect(api.bootstrap).toHaveBeenCalledOnce();
    expect(store.loading()).toBe(false);
  });

  it('hides permission-dependent schedule immediately on logout and rejects its in-flight response', async () => {
    session.set({ user: { id: 'owner' } });
    profile.set({ system_role: 'OWNER', roles: [] });
    const privileged = [{ id: 'private', participants: [{ outcome: 'WIN' }] }] as PublicMatch[];
    api.schedule.mockResolvedValue(privileged);
    const store = TestBed.inject(EventStore);
    await store.initialize();
    expect(store.schedule()).toEqual(privileged);
    const response = deferred<PublicMatch[]>();
    api.schedule.mockReturnValue(response.promise);
    const refresh = store.refresh();
    await settle();
    session.set(null);
    profile.set(null);
    expect(store.schedule()).toEqual([]);
    response.resolve(privileged);
    await refresh;
    expect(store.schedule()).toEqual([]);
    api.schedule.mockResolvedValue([]);
    await store.initialize();
    expect(store.schedule()).toEqual([]);
  });
});

describe('last-known outcome visibility', () => {
  it('redacts a previously public schedule immediately when visibility is disabled', () => {
    const event = { id: 'event', leaderboard_public: true } as PublicEvent;
    const referee = { system_role: 'MEMBER', roles: [{ event_id: 'event', role: 'REFEREE' }] };
    expect(canSeeAllOutcomes(event, referee)).toBe(true);
    event.leaderboard_public = false;
    expect(canSeeAllOutcomes(event, referee)).toBe(false);
    const matches = [
      {
        id: 'm1',
        participants: [
          { team_id: 't1', team_code: 'T01', side: 'A', outcome: 'WIN' },
          { team_id: 't2', team_code: 'T02', side: 'B', outcome: 'LOSS' },
        ],
      },
    ] as PublicMatch[];
    expect(
      redactMatchOutcomes(matches)[0].participants.every(
        (participant) => !('outcome' in participant),
      ),
    ).toBe(true);
    expect(
      redactMatchOutcomes(matches, 'T01')[0].participants.map((participant) => participant.outcome),
    ).toEqual(['WIN', undefined]);
    expect(matches[0].participants[1].outcome).toBe('LOSS');
    expect(canSeeAllOutcomes(event, { system_role: 'OWNER', roles: [] })).toBe(true);
    expect(
      canSeeAllOutcomes(event, {
        system_role: 'MEMBER',
        roles: [{ event_id: 'other', role: 'EVENT_ADMIN' }],
      }),
    ).toBe(false);
  });
});
