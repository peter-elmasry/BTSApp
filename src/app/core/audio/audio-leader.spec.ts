import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioLeader } from './audio-leader';
describe('one audible tab per event', () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  beforeEach(() =>
    Object.defineProperty(navigator, 'locks', { configurable: true, get: () => undefined }),
  );
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (descriptor) Object.defineProperty(navigator, 'locks', descriptor);
    else Reflect.deleteProperty(navigator, 'locks');
    localStorage.clear();
  });
  it('uses the shared Web Lock and hands over after release', async () => {
    vi.useFakeTimers();
    let held = false;
    vi.spyOn(navigator, 'locks', 'get').mockReturnValue({
      request: async (
        _name: string,
        _options: unknown,
        callback: (lock: object | null) => Promise<void>,
      ) => {
        if (held) return callback(null);
        held = true;
        try {
          return await callback({});
        } finally {
          held = false;
        }
      },
    } as unknown as LockManager);
    const changes1: boolean[] = [];
    const changes2: boolean[] = [];
    const first = new AudioLeader((value) => changes1.push(value));
    const second = new AudioLeader((value) => changes2.push(value));
    first.start('e1');
    second.start('e1');
    expect(changes1.at(-1)).toBe(true);
    expect(changes2.at(-1)).toBe(false);
    first.stop();
    await vi.advanceTimersByTimeAsync(2001);
    expect(changes2.at(-1)).toBe(true);
    second.stop();
  });
  it('verifies the storage lease when Web Locks is unavailable', async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'locks', 'get').mockReturnValue(undefined as unknown as LockManager);
    let firstLeader = false;
    let secondLeader = false;
    const first = new AudioLeader((value) => (firstLeader = value));
    const second = new AudioLeader((value) => (secondLeader = value));
    first.start('e1');
    second.start('e1');
    await vi.advanceTimersByTimeAsync(101);
    expect(firstLeader).toBe(true);
    expect(secondLeader).toBe(false);
    first.stop();
    await vi.advanceTimersByTimeAsync(2100);
    expect(secondLeader).toBe(true);
    second.stop();
  });
});
