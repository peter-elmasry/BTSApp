import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { ReadCacheService } from '../offline/read-cache.service';
import { EventStore } from '../player/event.store';
import type { PublicEvent } from '../player/public-types';
import { EventChannelService } from '../realtime/event-channel.service';
import { StandingsApi } from './standings-api';
import { StandingsReader } from './standings-reader';
import type { StandingRow } from './standings-types';

const rows = [{ rank: 1, total: 15, team: { id: 'one', code: 'T01' } }] as StandingRow[];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('standings visibility and refresh context', () => {
  const event = signal({ id: 'event', leaderboard_public: true } as PublicEvent);
  const session = signal<{ user: { id: string } } | null>(null);
  const profile = signal<{
    system_role: string;
    roles: { event_id: string; role: string }[];
  } | null>(null);
  const revision = signal(0);
  const updates = signal(0);
  const release = vi.fn();
  const read = vi.fn();
  beforeEach(() => {
    event.set({ id: 'event', leaderboard_public: true } as PublicEvent);
    session.set(null);
    profile.set(null);
    revision.set(0);
    updates.set(0);
    read.mockReset().mockResolvedValue(rows);
    release.mockReset();
    TestBed.configureTestingModule({
      providers: [
        StandingsReader,
        { provide: StandingsApi, useValue: { read } },
        { provide: EventStore, useValue: { event } },
        { provide: AuthStore, useValue: { session, profile } },
        { provide: ReadCacheService, useValue: { updates } },
        { provide: EventChannelService, useValue: { revision, acquire: () => release } },
      ],
    });
  });
  const reader = () => {
    const value = TestBed.inject(StandingsReader);
    value.eventId.set('event');
    return value;
  };
  it('clears a visible cached list immediately when publication is disabled', async () => {
    const value = reader();
    await settle();
    expect(value.rows()).toEqual(rows);
    event.update((current) => ({ ...current, leaderboard_public: false }));
    expect(value.rows()).toEqual([]);
    await settle();
    expect(value.allowed()).toBe(false);
    expect(read).toHaveBeenCalledOnce();
  });
  it('keeps hidden standings scoped to the event administrator and rejects late responses after logout', async () => {
    event.update((current) => ({ ...current, leaderboard_public: false }));
    session.set({ user: { id: 'admin' } });
    profile.set({ system_role: 'MEMBER', roles: [{ event_id: 'event', role: 'EVENT_ADMIN' }] });
    const pending = deferred<StandingRow[]>();
    read.mockReturnValue(pending.promise);
    const value = reader();
    await settle();
    expect(value.allowed()).toBe(true);
    session.set(null);
    profile.set(null);
    expect(value.rows()).toEqual([]);
    pending.resolve(rows);
    await settle();
    expect(value.rows()).toEqual([]);
  });
  it.each(['REFEREE', 'GUIDE', 'EVENT_ADMIN'])(
    'denies hidden rows to %s outside its admin scope',
    async (role) => {
      event.update((current) => ({ ...current, leaderboard_public: false }));
      profile.set({
        system_role: 'MEMBER',
        roles: [{ event_id: role === 'EVENT_ADMIN' ? 'other' : 'event', role }],
      });
      const value = reader();
      await settle();
      expect(value.rows()).toEqual([]);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('forces fresh reads after realtime and refresh, and never revives stale rows on a denied response', async () => {
    const value = reader();
    await settle();
    expect(read).toHaveBeenLastCalledWith('event', false);
    revision.set(1);
    await settle();
    expect(read).toHaveBeenLastCalledWith('event', true);
    read.mockRejectedValue(new Error('LEADERBOARD_HIDDEN'));
    value.refresh();
    await settle();
    expect(value.rows()).toEqual([]);
    expect(value.error()).toBe('leaderboard.hidden');
  });
  it('discards an earlier event response and releases the subscription', async () => {
    const pending = deferred<StandingRow[]>();
    read.mockReturnValueOnce(pending.promise);
    const value = reader();
    await settle();
    event.set({ id: 'new', leaderboard_public: true } as PublicEvent);
    value.eventId.set('new');
    await settle();
    pending.resolve([{ ...rows[0], total: 999 }]);
    await settle();
    expect(value.rows()).toEqual(rows);
    expect(release).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    expect(release).toHaveBeenCalledTimes(2);
  });
});
