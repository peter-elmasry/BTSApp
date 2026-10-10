import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { OfflineDb } from './offline-db';
import { MemoryOfflineDb } from './memory-offline-db.testing';
import { ReadCacheService, stableJson } from './read-cache.service';
import { RpcTransport } from './rpc-transport';

describe('last-known RPC cache and privacy', () => {
  const session = signal<{ user: { id: string } } | null>(null);
  const profile = signal<{
    id: string;
    system_role: string;
    roles: unknown[];
    assigned_games: unknown[];
  } | null>(null);
  const rpc = vi.fn();
  let database: MemoryOfflineDb;
  beforeEach(() => {
    database = new MemoryOfflineDb();
    session.set(null);
    profile.set(null);
    rpc.mockReset();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session, profile } },
        { provide: OfflineDb, useValue: database },
        { provide: RpcTransport, useValue: { rpc } },
      ],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores cached reads immediately while offline and retains their last-success timestamp', async () => {
    const cache = TestBed.inject(ReadCacheService);
    rpc.mockResolvedValue({ teams: ['T01'] });
    const fresh = await cache.read('get_bootstrap', { p_event: 'e1' });
    const timestamp = cache.lastUpdated();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await cache.read('get_bootstrap', { p_event: 'e1' })).toEqual(fresh);
    expect(cache.lastUpdated()).toBe(timestamp);
    expect(cache.stale()).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('revalidates cache in the background and publishes changes only when data changes', async () => {
    const cache = TestBed.inject(ReadCacheService);
    rpc.mockResolvedValueOnce({ round: 1 });
    await cache.read('get_schedule', { p_event: 'e1' });
    rpc.mockResolvedValue({ round: 2 });
    expect(await cache.read('get_schedule', { p_event: 'e1' })).toEqual({ round: 1 });
    expect(await cache.read('get_schedule', { p_event: 'e1' }, true)).toEqual({ round: 2 });
    expect(cache.updates()).toBe(1);
    expect(cache.stale()).toBe(false);
    await cache.read('get_schedule', { p_event: 'e1' }, true);
    expect(cache.updates()).toBe(1);
  });

  it('never serves owner data to an anonymous or different signed-in user', async () => {
    session.set({ user: { id: 'owner-user' } });
    profile.set({ id: 'owner-member', system_role: 'OWNER', roles: [], assigned_games: [] });
    const cache = TestBed.inject(ReadCacheService);
    TestBed.tick();
    rpc.mockResolvedValue({ private: 'owner data' });
    await cache.read('get_live_event', { p_event: 'e1' });
    session.set(null);
    profile.set(null);
    TestBed.tick();
    rpc.mockRejectedValue({ code: 'P0001', message: 'FORBIDDEN' });
    await expect(cache.read('get_live_event', { p_event: 'e1' })).rejects.toMatchObject({
      message: 'FORBIDDEN',
    });
    session.set({ user: { id: 'different-user' } });
    profile.set({ id: 'other-member', system_role: 'MEMBER', roles: [], assigned_games: [] });
    await expect(cache.read('get_live_event', { p_event: 'e1' })).rejects.toMatchObject({
      message: 'FORBIDDEN',
    });
    expect(
      [...database.reads.values()].some(
        (row) => (row.data as { private?: string }).private === 'owner data',
      ),
    ).toBe(false);
  });

  it('drops an in-flight privileged response if authentication changes', async () => {
    session.set({ user: { id: 'u1' } });
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const cache = TestBed.inject(ReadCacheService);
    const pending = cache.read('get_schedule', { p_event: 'e1' });
    await Promise.resolve();
    await Promise.resolve();
    session.set(null);
    resolve({ hidden: 'results' });
    await expect(pending).rejects.toMatchObject({ code: 'ACTOR_CHANGED' });
    expect(database.reads.size).toBe(0);
  });

  it('never uses stale data to bypass a permanent permission error', async () => {
    const cache = TestBed.inject(ReadCacheService);
    rpc.mockResolvedValue({ private: 'prior result' });
    await cache.read('get_match_entry', { p_match: 'm1' });
    rpc.mockRejectedValue({ code: '42501', message: 'permission denied' });
    await expect(cache.read('get_match_entry', { p_match: 'm1' }, true)).rejects.toMatchObject({
      code: '42501',
    });
    expect(database.reads.size).toBe(0);
  });

  it('never caches authentication, credentials, server time or mutation RPCs', async () => {
    const cache = TestBed.inject(ReadCacheService);
    rpc.mockResolvedValue('ok');
    await cache.read('get_my_profile');
    await cache.read('server_now');
    await cache.read('reset_password', { password: 'test-only' });
    expect(database.reads.size).toBe(0);
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it('does not let a read started before a mutation repopulate an invalidated cache', async () => {
    const cache = TestBed.inject(ReadCacheService);
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const old = cache.read('get_schedule', { p_event: 'e1' });
    await Promise.resolve();
    await Promise.resolve();
    await cache.invalidate();
    rpc.mockResolvedValue({ round: 'new' });
    await cache.read('get_schedule', { p_event: 'e1' });
    resolve({ round: 'old' });
    await expect(old).rejects.toMatchObject({ code: 'STALE_RESPONSE' });
    expect([...database.reads.values()].map((value) => value.data)).toEqual([{ round: 'new' }]);
  });
});
