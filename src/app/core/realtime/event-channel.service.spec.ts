import { TestBed } from '@angular/core/testing';
import {
  EventChannelService,
  EventChannelTransport,
  pollingDelay,
  thinEventSignal,
  thinRoundAudioSignal,
} from './event-channel.service';

describe('thin realtime signals', () => {
  it('allows only fresh-cue identifiers, with no result data', () => {
    const cue = {
      type: 'round_audio',
      cue: 'round-start',
      cueId: '11000000-0000-0000-0000-000000000001',
      roundId: '66000000-0000-0000-0000-000000000001',
      occurredAt: new Date().toISOString(),
    };
    expect(thinRoundAudioSignal('round_audio', cue)).toBe(true);
    expect(thinRoundAudioSignal('*', cue)).toBe(true);
    expect(thinRoundAudioSignal('round_audio', { ...cue, outcome: 'WIN' })).toBe(false);
    expect(thinRoundAudioSignal('round_audio', { ...cue, cue: 'match-win' })).toBe(false);
    expect(thinRoundAudioSignal('match_changed', cue)).toBe(false);
    expect(thinRoundAudioSignal('round_audio', { ...cue, cueId: 'invalid' })).toBe(false);
  });
  it('accepts only allowed event names and identifier-only payloads', () => {
    expect(
      thinEventSignal('match_changed', { type: 'match_changed', matchId: 'm1', roundId: 'r1' }),
    ).toBe(true);
    expect(thinEventSignal('match_changed', { type: 'match_changed', outcome: 'WIN' })).toBe(false);
    expect(thinEventSignal('match_changed', { type: 'round_changed' })).toBe(false);
    expect(thinEventSignal('postgres_changes', { record: { result: 4 } })).toBe(false);
    expect(thinEventSignal('match_changed', null)).toBe(false);
    expect([0, 0.5, 0.99999].map(pollingDelay)).toEqual([4000, 4500, 4999]);
  });
});

describe('realtime fallback and channel lifecycle', () => {
  let receive: (event: string, payload: unknown) => void;
  let status: (value: string) => void;
  let visible: DocumentVisibilityState;
  const close = vi.fn();
  const connect = vi.fn();
  const probe = vi.fn();
  const needsRecovery = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    visible = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    close.mockReset();
    let token = 0;
    probe.mockReset().mockImplementation(async () => String(++token));
    needsRecovery.mockReset().mockReturnValue(false);
    connect.mockReset().mockImplementation(async (_id, onSignal, onStatus) => {
      receive = onSignal;
      status = onStatus;
      return { close };
    });
    TestBed.configureTestingModule({
      providers: [{ provide: EventChannelTransport, useValue: { connect, probe, needsRecovery } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('delivers each round cue immediately before refetch debounce', () => {
    const service = TestBed.inject(EventChannelService);
    const seen: string[] = [];
    service.immediate.subscribe((message) => seen.push((message.payload as { cue: string }).cue));
    service.watch('e1');
    const cue = {
      type: 'round_audio',
      cueId: '11000000-0000-0000-0000-000000000001',
      roundId: '66000000-0000-0000-0000-000000000001',
      occurredAt: new Date().toISOString(),
    };
    receive('round_audio', { ...cue, cue: 'round-end' });
    receive('round_audio', { ...cue, cue: 'round-start' });
    expect(seen).toEqual(['round-end', 'round-start']);
    expect(service.revision()).toBe(1);
  });

  it('recovers while subscribed, disconnected or without a socket', async () => {
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    const before = service.revision();
    await vi.advanceTimersByTimeAsync(4500);
    expect(service.revision()).toBe(before + 1);
    status('SUBSCRIBED');
    const subscribed = service.revision();
    await vi.advanceTimersByTimeAsync(9000);
    expect(service.revision()).toBe(subscribed + 2);
    status('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(4500);
    expect(service.revision()).toBe(subscribed + 3);
  });
  it('keeps recovery available when socket creation fails', async () => {
    connect.mockRejectedValue(new Error('WebSocket unavailable'));
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    const before = service.revision();
    await vi.advanceTimersByTimeAsync(9000);
    expect(service.revision()).toBe(before + 2);
  });
  it('bounds batching during sustained broadcasts and ignores result payloads', async () => {
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    const before = service.revision();
    receive('match_changed', { type: 'match_changed', matchId: 'm1' });
    await vi.advanceTimersByTimeAsync(200);
    receive('round_changed', { type: 'round_changed', roundId: 'r1' });
    receive('match_changed', { type: 'match_changed', outcome: 'WIN' });
    await vi.advanceTimersByTimeAsync(50);
    expect(service.revision()).toBe(before + 1);
  });
  it('does not refresh while hidden and recovers immediately on return', async () => {
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    const before = service.revision();
    visible = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(13500);
    expect(service.revision()).toBe(before);
    visible = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.revision()).toBe(before + 1);
  });
  it('does not refetch unchanged data and backs off failed probes', async () => {
    probe.mockResolvedValue('same');
    const service = TestBed.inject(EventChannelService);
    service.watch('e1');
    await vi.advanceTimersByTimeAsync(4500);
    const before = service.revision();
    await vi.advanceTimersByTimeAsync(9000);
    expect(service.revision()).toBe(before);
    needsRecovery.mockReturnValueOnce(true);
    await vi.advanceTimersByTimeAsync(4500);
    expect(service.revision()).toBe(before + 1);
    probe.mockRejectedValue(new Error('network'));
    await vi.advanceTimersByTimeAsync(4500);
    const calls = probe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(8999);
    expect(probe).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(1);
    expect(probe).toHaveBeenCalledTimes(calls + 1);
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
    expect(service.revision()).toBe(previous + 2);
    TestBed.resetTestingModule();
    const stopped = service.revision();
    await vi.advanceTimersByTimeAsync(60000);
    expect(service.revision()).toBe(stopped);
    expect(vi.getTimerCount()).toBe(0);
  });
});
