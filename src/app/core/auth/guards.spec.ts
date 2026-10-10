import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { AuthStore } from './auth.store';
import { authGuard, guestOnlyGuard, ownerGuard, scoringGuard } from './guards';

describe('staff route guards', () => {
  const profile = signal<{ system_role: 'OWNER' | 'MEMBER'; roles?: { role: string }[] } | null>(
    null,
  );
  const session = signal<unknown>(null);
  const auth = { profile, session, initialize: vi.fn(async () => {}) };

  beforeEach(() => {
    profile.set(null);
    session.set(null);
    auth.initialize.mockClear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: auth }],
    });
  });

  it('redirects unauthenticated staff routes to login with the requested URL', async () => {
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/owner/members' } as never),
    );
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toContain(
      '/login?returnUrl=%2Fowner%2Fmembers',
    );
    expect(auth.initialize).toHaveBeenCalledOnce();
  });

  it('allows an authenticated session through the auth guard', async () => {
    session.set({ access_token: 'staff-token' });
    expect(
      await TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/ref' } as never)),
    ).toBe(true);
  });

  it('redirects a referee away from the owner area', async () => {
    session.set({ access_token: 'referee-token' });
    profile.set({ system_role: 'MEMBER' });
    const result = await TestBed.runInInjectionContext(() => ownerGuard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
  });

  it('allows an owner through the owner guard', async () => {
    session.set({ access_token: 'owner-token' });
    profile.set({ system_role: 'OWNER' });
    expect(await TestBed.runInInjectionContext(() => ownerGuard({} as never, {} as never))).toBe(
      true,
    );
  });

  it('allows scoring staff and rejects guide-only profiles', async () => {
    for (const role of ['REFEREE', 'EVENT_ADMIN']) {
      profile.set({ system_role: 'MEMBER', roles: [{ role }] });
      expect(
        await TestBed.runInInjectionContext(() => scoringGuard({} as never, {} as never)),
      ).toBe(true);
    }
    profile.set({ system_role: 'MEMBER', roles: [{ role: 'GUIDE' }] });
    const result = await TestBed.runInInjectionContext(() =>
      scoringGuard({} as never, {} as never),
    );
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
  });

  it('redirects signed-in staff away from the guest login route', async () => {
    session.set({ access_token: 'staff-token' });
    const result = await TestBed.runInInjectionContext(() =>
      guestOnlyGuard({} as never, {} as never),
    );
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
  });
});
