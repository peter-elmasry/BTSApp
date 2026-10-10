import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';
import { OfflineDb } from './offline-db';
import { MemoryOfflineDb } from './memory-offline-db.testing';
import { OpQueueService } from './op-queue.service';
import { actorIdentity, isNetworkFailure, retryDelay } from './rpc-errors';
import { ReadCacheService } from './read-cache.service';
import { RpcTransport } from './rpc-transport';

describe('durable actor-bound operation queue', () => {
  const session = signal<{ user: { id: string }; access_token: string } | null>(null);
  const profile = signal<{ id: string } | null>(null);
  const auth = {
    session,
    profile,
    initialize: vi.fn(async () => {}),
    loadProfile: vi.fn(async () => {}),
  };
  const mutate = vi.fn();
  let database: MemoryOfflineDb;
  let online = false;
  function configure() {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        { provide: OfflineDb, useValue: database },
        { provide: RpcTransport, useValue: { mutate } },
        { provide: ReadCacheService, useValue: { invalidate: vi.fn(async () => {}) } },
      ],
    });
    return TestBed.inject(OpQueueService);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    online = false;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    session.set({ user: { id: 'u1' }, access_token: 'test-only' });
    profile.set({ id: 'm1' });
    database = new MemoryOfflineDb();
    mutate.mockReset().mockResolvedValue({ applied: true });
    auth.loadProfile.mockClear();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('commits a pending operation before its first send, then retains its acknowledgment', async () => {
    const queue = configure();
    online = true;
    mutate.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      expect(await database.operation(String(args['p_op_id']))).toBeDefined();
      return { applied: true };
    });
    const receipt = await queue.execute('start_round', { p_round: 'round' });
    expect(receipt.status).toBe('sent');
    expect(receipt.data).toEqual({ applied: true });
    expect(mutate).toHaveBeenCalledOnce();
    expect(queue.pending()).toBe(0);
    expect(auth.loadProfile).toHaveBeenCalled();
  });
  it('keeps restoration unready until the current actor rows load and invalidates readiness immediately on identity changes', async () => {
    let resolve!: (rows: []) => void;
    vi.spyOn(database, 'operations').mockReturnValue(
      new Promise<[]>((done) => {
        resolve = done;
      }),
    );
    const queue = configure();
    expect(queue.ready()).toBe(false);
    TestBed.tick();
    expect(queue.ready()).toBe(false);
    resolve([]);
    for (let index = 0; index < 8; index++) await Promise.resolve();
    expect(queue.ready()).toBe(true);
    session.set({ user: { id: 'u2' }, access_token: 'other-test-only' });
    profile.set({ id: 'm2' });
    expect(queue.ready()).toBe(false);
    session.set(null);
    profile.set(null);
    expect(queue.ready()).toBe(true);
  });

  it('recovers queued rows after a service reload and retries an acknowledgment loss using the same id', async () => {
    let queue = configure();
    const receipt = await queue.execute('submit_match_result', {
      p_match: 'match',
      p_outcomes: [],
    });
    expect(receipt.status).toBe('queued');
    expect(queue.operations()[0].args['p_match']).toBe('match');
    TestBed.resetTestingModule();
    queue = configure();
    online = true;
    mutate.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await queue.flush();
    expect(queue.pending()).toBe(1);
    expect(database.rows.get(receipt.opId)?.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls.map((call) => call[1]['p_op_id'])).toEqual([
      receipt.opId,
      receipt.opId,
    ]);
    expect(queue.pending()).toBe(0);
  });

  it('preserves FIFO order and does not bypass a failed earlier operation', async () => {
    const queue = configure();
    const first = await queue.execute('start_round', { p_round: 'round' });
    const second = await queue.execute('extend_round', { p_round: 'round', p_minutes: 5 });
    online = true;
    mutate.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await queue.flush();
    expect(mutate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mutate.mock.calls.map((call) => call[1]['p_op_id'])).toEqual([
      first.opId,
      first.opId,
      second.opId,
    ]);
  });

  it('pauses on logout and refuses to replay an old actor under another identity', async () => {
    const queue = configure();
    const receipt = await queue.execute('start_round', { p_round: 'round' });
    session.set({ user: { id: 'u2' }, access_token: 'other-test-only' });
    profile.set({ id: 'm2' });
    online = true;
    await queue.flush();
    expect(mutate).not.toHaveBeenCalled();
    expect(queue.pending()).toBe(0);
    expect(await database.operation(receipt.opId)).toBeDefined();
    session.set({ user: { id: 'u1' }, access_token: 'test-only' });
    profile.set({ id: 'm1' });
    await queue.flush();
    expect(mutate).toHaveBeenCalledOnce();
  });

  it('removes permanent permission/business failures, exposes details, and continues later rows', async () => {
    const queue = configure();
    online = true;
    mutate.mockRejectedValueOnce({
      code: 'P0001',
      message: 'PENDING_MATCHES',
      details: { matches: ['m1'] },
    });
    await expect(queue.execute('close_round', { p_round: 'r1' })).rejects.toMatchObject({
      message: 'PENDING_MATCHES',
    });
    expect(queue.pending()).toBe(0);
    expect(queue.failures()[0]).toMatchObject({
      code: 'PENDING_MATCHES',
      details: { matches: ['m1'] },
    });
    expect((await queue.execute('extend_round', { p_round: 'r1', p_minutes: 5 })).status).toBe(
      'sent',
    );
    await vi.advanceTimersByTimeAsync(60000);
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('fails clearly before sending if durable storage is unavailable and refuses credential payloads', async () => {
    const queue = configure();
    online = true;
    vi.spyOn(database, 'enqueue').mockRejectedValue(new Error('quota'));
    await expect(queue.execute('start_round', { p_round: 'r1' })).rejects.toMatchObject({
      code: 'OFFLINE_STORAGE_UNAVAILABLE',
    });
    await expect(queue.execute('reset_password', { password: 'test-only' })).rejects.toMatchObject({
      code: 'UNSAFE_QUEUED_OPERATION',
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('returns a durable cross-tab acknowledgment and does not steal another tab lease', async () => {
    const queue = configure();
    const pending = await queue.execute('start_round', { p_round: 'r1' });
    const actor = actorIdentity('u1', 'm1', environment.supabaseUrl)!;
    const claim = await database.claim(actor, 'other-tab', Date.now());
    online = true;
    await queue.flush();
    expect(mutate).not.toHaveBeenCalled();
    await database.finish(claim.operation!, 'other-tab', undefined, {
      data: { applied: true, fromOtherTab: true },
    });
    const acknowledgment = await database.acknowledge(pending.opId, actor);
    expect(acknowledgment?.data).toEqual({ applied: true, fromOtherTab: true });
  });
});

describe('retry classification and backoff', () => {
  it('retries transport failures only and caps exponential backoff at sixty seconds', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new DOMException('This operation was aborted', 'AbortError'))).toBe(
      true,
    );
    expect(isNetworkFailure({ code: 'PGRST003', status: 503, message: 'Pool unavailable' })).toBe(
      true,
    );
    expect(isNetworkFailure({ code: 'P0001', status: 500, message: 'INVALID_OUTCOMES' })).toBe(
      false,
    );
    expect(isNetworkFailure({ message: 'TypeError: Failed to fetch', status: 0 })).toBe(true);
    expect(isNetworkFailure({ code: 'P0001', message: 'ROUND_CLOSED' })).toBe(false);
    expect(isNetworkFailure({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isNetworkFailure({ status: 401, message: 'Unauthorized' })).toBe(false);
    expect([0, 1, 2, 3, 4, 5, 10].map(retryDelay)).toEqual([
      2000, 4000, 8000, 16000, 32000, 60000, 60000,
    ]);
    expect(actorIdentity('u1', 'm1', 'preview')).not.toBe(actorIdentity('u1', 'm1', 'production'));
  });
});
