import { Component, OnDestroy, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore, StaffProfile } from './auth.store';
import { SessionOutlet } from './session-outlet';

let destroyed: number;
let finishRead: (value: string) => void;
@Component({ template: '<input value="private draft" /><p>{{ data() }}</p>' })
class StaffScreen implements OnDestroy {
  readonly data = signal('private data');
  constructor() {
    void new Promise<string>((resolve) => (finishRead = resolve)).then((data) =>
      this.data.set(data),
    );
  }
  ngOnDestroy() {
    destroyed++;
  }
}

describe('staff session outlet lifecycle', () => {
  const profile = signal<StaffProfile | null>(null);
  const session = signal<{ user: { id: string }; access_token?: string } | null>(null);
  const owner: StaffProfile = {
    id: 'owner',
    username: 'owner',
    phone: null,
    full_name_en: 'Owner',
    full_name_ar: null,
    system_role: 'OWNER',
    roles: [],
    assigned_games: [],
  };
  const auth = { profile, session, ready: signal(true) };
  beforeEach(() => {
    destroyed = 0;
    profile.set(structuredClone(owner));
    session.set({ user: { id: 'actor-one' } });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        provideRouter([
          { path: 'owner/members', component: StaffScreen },
          { path: 'manage/:eventId/setup', component: StaffScreen },
          { path: 'ref', component: StaffScreen },
          { path: 'home', component: StaffScreen },
        ]),
      ],
    });
  });
  async function open(url: string) {
    const fixture = TestBed.createComponent(SessionOutlet);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    destroyed = 0; // Observe changes after the initial route has settled.
    return fixture;
  }
  for (const url of ['/owner/members', '/manage/event/setup', '/ref']) {
    it(`destroys ${url} on logout and prevents late reads restoring its DOM`, async () => {
      const fixture = await open(url);
      expect(fixture.nativeElement.textContent).toContain('private data');
      const lateRead = finishRead;
      session.set(null);
      profile.set(null);
      fixture.detectChanges();
      expect(destroyed).toBe(1);
      expect(fixture.nativeElement.querySelector('input')).toBeNull();
      lateRead('late private response');
      await Promise.resolve();
      expect(fixture.nativeElement.textContent).not.toContain('late private response');
    });
  }
  it('discards form drafts when switching between authorized actors', async () => {
    const fixture = await open('/owner/members');
    fixture.nativeElement.querySelector('input').value = 'previous actor secret';
    session.set({ user: { id: 'actor-two' } });
    profile.set({ ...owner, id: 'other-owner' });
    fixture.detectChanges();
    expect(destroyed).toBe(1);
    expect(fixture.nativeElement.querySelector('input').value).toBe('private draft');
  });
  it('removes an open setup screen when its event admin role is revoked', async () => {
    profile.set({
      ...owner,
      system_role: 'MEMBER',
      roles: [{ event_id: 'event', role: 'EVENT_ADMIN', team_id: null }],
    });
    const fixture = await open('/manage/event/setup');
    profile.set({ ...profile()!, roles: [] });
    fixture.detectChanges();
    expect(destroyed).toBe(1);
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
  it('preserves staff drafts during same-actor token refresh', async () => {
    const fixture = await open('/ref');
    const input = fixture.nativeElement.querySelector('input');
    session.set({ user: { id: 'actor-one' }, access_token: 'refreshed' });
    profile.set(structuredClone(owner));
    fixture.detectChanges();
    expect(destroyed).toBe(0);
    expect(fixture.nativeElement.querySelector('input')).toBe(input);
  });
  it('destroys owner screens on system-role downgrade', async () => {
    const fixture = await open('/owner/members');
    profile.set({ ...owner, system_role: 'MEMBER' });
    fixture.detectChanges();
    expect(destroyed).toBe(1);
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
  it('discards referee drafts when assigned games change', async () => {
    profile.set({
      ...owner,
      system_role: 'MEMBER',
      roles: [{ event_id: 'event', role: 'REFEREE', team_id: null }],
      assigned_games: [{ event_id: 'event', game_id: 'old-game' }],
    });
    const fixture = await open('/ref');
    fixture.nativeElement.querySelector('input').value = 'old assignment draft';
    profile.set({ ...profile()!, assigned_games: [] });
    fixture.detectChanges();
    expect(destroyed).toBe(1);
    expect(fixture.nativeElement.querySelector('input').value).toBe('private draft');
  });
  it('preserves public pages on logout', async () => {
    const fixture = await open('/home');
    session.set(null);
    profile.set(null);
    fixture.detectChanges();
    expect(destroyed).toBe(0);
    expect(fixture.nativeElement.querySelector('input')).not.toBeNull();
  });
});
