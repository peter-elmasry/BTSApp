import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDeviceData } from './device-data';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('logout device clearing (D047)', () => {
  it('clears local and session storage except the language and destroys the database', async () => {
    localStorage.setItem('bts.lang', 'en');
    localStorage.setItem('bts.team.event', 'T01');
    localStorage.setItem('sb-127-auth-token', '{}');
    sessionStorage.setItem('draft', 'x');
    const destroy = vi.fn(async () => {});
    await clearDeviceData(destroy);
    expect(localStorage.getItem('bts.lang')).toBe('en');
    expect(localStorage.getItem('bts.team.event')).toBeNull();
    expect(localStorage.getItem('sb-127-auth-token')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('keeps going when one store fails', async () => {
    localStorage.setItem('bts.team.event', 'T01');
    const destroy = vi.fn(async () => {
      throw new Error('blocked');
    });
    await expect(clearDeviceData(destroy)).resolves.toBeUndefined();
    expect(localStorage.getItem('bts.team.event')).toBeNull();
  });
});
