import { TestBed } from '@angular/core/testing';
import { PublicApi } from '../player/public-api';
import { roundCountdown, serverClockOffset, ServerClockService } from './server-clock.service';

describe('server-derived round time', () => {
  it('uses the request midpoint to compensate for transport latency and device skew', () => {
    expect(serverClockOffset(5000, 1000, 1200)).toBe(3900);
    expect(serverClockOffset(1000, 5000, 5000)).toBe(-4000);
  });

  it('counts down, then counts overtime without closing the round', () => {
    const end = '2026-10-10T12:00:00Z';
    const endMs = Date.parse(end);
    expect(roundCountdown(end, endMs - 12500)).toEqual({ seconds: 13, overtime: false });
    expect(roundCountdown(end, endMs)).toEqual({ seconds: 0, overtime: true });
    expect(roundCountdown(end, endMs + 12000)).toEqual({ seconds: 12, overtime: true });
    expect(roundCountdown(null, endMs)).toEqual({ seconds: 0, overtime: false });
    expect(roundCountdown('invalid', endMs)).toEqual({ seconds: 0, overtime: false });
  });
});

describe('server clock lifecycle', () => {
  const serverNow = vi.fn<() => Promise<string>>();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    serverNow.mockReset().mockResolvedValue(new Date(5000).toISOString());
    TestBed.configureTestingModule({
      providers: [{ provide: PublicApi, useValue: { serverNow } }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('deduplicates synchronization and ticks with the compensated offset', async () => {
    let resolve!: (value: string) => void;
    serverNow.mockReturnValue(
      new Promise<string>((done) => {
        resolve = done;
      }),
    );
    const clock = TestBed.inject(ServerClockService);
    const pending = clock.synchronize();
    expect(clock.synchronize()).toBe(pending);
    vi.setSystemTime(1200);
    resolve(new Date(5000).toISOString());
    await pending;
    expect(clock.now()).toBe(5100);
    expect(clock.synchronized()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(clock.now()).toBe(6100);
  });

  it('keeps ticking after a network failure and permits resynchronization', async () => {
    serverNow.mockRejectedValueOnce(new Error('offline'));
    const clock = TestBed.inject(ServerClockService);
    await clock.synchronize();
    expect(clock.synchronized()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(clock.now()).toBe(2000);
    await clock.synchronize();
    expect(clock.synchronized()).toBe(true);
    expect(clock.now()).toBe(5000);
  });

  it('resynchronizes on reconnect and returning to a visible tab, then removes listeners and timer', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const clock = TestBed.inject(ServerClockService);
    await clock.synchronize();
    window.dispatchEvent(new Event('online'));
    await clock.synchronize();
    document.dispatchEvent(new Event('visibilitychange'));
    await clock.synchronize();
    expect(serverNow).toHaveBeenCalledTimes(3);
    TestBed.resetTestingModule();
    const previous = clock.now();
    await vi.advanceTimersByTimeAsync(5000);
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.now()).toBe(previous);
    expect(serverNow).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards a pending server response after destruction', async () => {
    let resolve!: (value: string) => void;
    serverNow.mockReturnValue(
      new Promise<string>((done) => {
        resolve = done;
      }),
    );
    const clock = TestBed.inject(ServerClockService);
    const pending = clock.synchronize();
    TestBed.resetTestingModule();
    resolve(new Date(5000).toISOString());
    await pending;
    expect(clock.now()).toBe(1000);
    expect(clock.synchronized()).toBe(false);
  });
});
