import { TestBed } from '@angular/core/testing';
import {
  EventChannelService,
  EventChannelTransport,
  pollingDelay,
  thinEventSignal,
} from './event-channel.service';

describe('thin realtime signals', () => {
  it('accepts only allowed event names and identifier-only payloads', () => {
    expect(
      thinEventSignal('match_changed', { type: 'match_changed', matchId: 'm1', roundId: 'r1' }),
    ).toBe(true);
    expect(thinEventSignal('match_changed', { type: 'match_changed', outcome: 'WIN' })).toBe(false);
    expect(thinEventSignal('match_changed', { type: 'round_changed' })).toBe(false);
    expect(thinEventSignal('postgres_changes', { record: { result: 4 } })).toBe(false);
    expect(thinEventSignal('match_changed', null)).toBe(false);
    expect([0, 0.5, 0.99999].map(pollingDelay)).toEqual([12000, 15000, 17999]);
  });
});

describe('realtime fallback and channel lifecycle', () => {
  let receive: (event: string, payload: unknown) => void;
  let status: (value: string) => void;
  let visible: DocumentVisibilityState;
  const close = vi.fn();
  const connect = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    visible = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    close.mockReset();
    connect.mockReset().mockImplementation(async (_id, onSignal, onStatus) => {
      receive = onSignal;
      status = onStatus;
      return { close };
    });
    TestBed.configureTestingModule({
      providers: [{ provide: EventChannelTransport, useValue: { connect } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls after ten seconds without WebSocket subscription, then stops polling when subscribed', async () => {
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    await vi.advanceTimersByTimeAsync(9999);
    expect(service.revision()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(service.revision()).toBe(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(service.revision()).toBe(2);
    status('SUBSCRIBED');
    const revision = service.revision();
    await vi.advanceTimersByTimeAsync(30000);
    expect(service.revision()).toBe(revision);
    status('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(10000);
    expect(service.revision()).toBe(revision + 1);
  });

  it('keeps polling available when creating a WebSocket channel itself fails', async () => {
    connect.mockRejectedValue(new Error('WebSocket unavailable'));
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    await vi.advanceTimersByTimeAsync(10000);
    expect(service.revision()).toBe(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(service.revision()).toBe(2);
  });

  it('debounces thin broadcasts for five hundred milliseconds and ignores result payloads', async () => {
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    await Promise.resolve();
    status('SUBSCRIBED');
    const before = service.revision();
    receive('match_changed', { type: 'match_changed', matchId: 'm1' });
    await vi.advanceTimersByTimeAsync(300);
    receive('round_changed', { type: 'round_changed', roundId: 'r1' });
    receive('match_changed', { type: 'match_changed', outcome: 'WIN' });
    await vi.advanceTimersByTimeAsync(499);
    expect(service.revision()).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(service.revision()).toBe(before + 1);
  });

  it('deduplicates view acquisitions, retains the shell channel and releases noncurrent event channels', async () => {
    const service = TestBed.inject(EventChannelService);
    service.watch('current');
    const first = service.acquire('other');
    const second = service.acquire('other');
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(2);
    first();
    expect(close).not.toHaveBeenCalled();
    second();
    expect(close).toHaveBeenCalledOnce();
    second();
    expect(close).toHaveBeenCalledOnce();
    service.watch(null);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('disconnects after a minute hidden and refetches/reconnects when visible again', async () => {
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    await Promise.resolve();
    status('SUBSCRIBED');
    visible = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(59999);
    expect(close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(close).toHaveBeenCalledOnce();
    const previous = service.revision();
    visible = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(connect).toHaveBeenCalledTimes(2);
    expect(service.revision()).toBe(previous + 1);
    TestBed.resetTestingModule();
    const stopped = service.revision();
    await vi.advanceTimersByTimeAsync(60000);
    expect(service.revision()).toBe(stopped);
    expect(vi.getTimerCount()).toBe(0);
  });
});
