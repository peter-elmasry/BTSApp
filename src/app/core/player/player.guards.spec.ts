import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter, Router, UrlTree } from '@angular/router';
import { EventStore } from './event.store';
import { leaderboardVisibleGuard, teamChosenGuard } from './player.guards';
import { TeamSelectionStore } from './team-selection.store';
import { AuthStore } from '../auth/auth.store';
import { ToastService } from '../../shared/ui/toast';

describe('player team route guard', () => {
  const event = signal<{ id: string } | null>({ id: 'current' });
  const selectedCode = signal<string | null>(null);
  const initialize = vi.fn(async () => {});
  const guard = (team?: string) =>
    TestBed.runInInjectionContext(() =>
      teamChosenGuard(
        {
          queryParamMap: convertToParamMap(team === undefined ? {} : { team }),
        } as never,
        {} as never,
      ),
    );
  beforeEach(() => {
    event.set({ id: 'current' });
    selectedCode.set(null);
    initialize.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EventStore, useValue: { event, initialize } },
        { provide: TeamSelectionStore, useValue: { selectedCode, staffWithoutTeam: () => false } },
      ],
    });
  });

  it('loads the event and redirects an unselected player', async () => {
    const result = await guard();
    expect(initialize).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/choose-team');
  });

  it('allows selected players and a graceful no-current-event screen', async () => {
    selectedCode.set('T01');
    expect(await guard()).toBe(true);
    selectedCode.set(null);
    event.set(null);
    expect(await guard()).toBe(true);
  });

  it('requires explicit QR-code confirmation even with a previous choice', async () => {
    selectedCode.set('T02');
    const result = await guard('T01');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/choose-team?team=T01');
    expect(selectedCode()).toBe('T02');
  });
});

describe('standings visibility route guard', () => {
  const event = signal({ id: 'event', leaderboard_public: false });
  const profile = signal<{
    system_role: string;
    roles: { event_id: string; role: string }[];
  } | null>(null);
  const show = vi.fn();
  beforeEach(() => {
    event.set({ id: 'event', leaderboard_public: false });
    profile.set(null);
    show.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EventStore, useValue: { event, initialize: async () => {} } },
        { provide: AuthStore, useValue: { profile } },
        { provide: ToastService, useValue: { show } },
      ],
    });
  });
  const guard = () =>
    TestBed.runInInjectionContext(() => leaderboardVisibleGuard({} as never, {} as never));
  it('redirects hidden player/referee links with an explanation', async () => {
    profile.set({ system_role: 'MEMBER', roles: [{ event_id: 'event', role: 'REFEREE' }] });
    const result = await guard();
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/home');
    expect(show).toHaveBeenCalledWith('leaderboard.hidden');
  });
  it('allows publication or the correct administrator and denies another event administrator', async () => {
    event.set({ id: 'event', leaderboard_public: true });
    expect(await guard()).toBe(true);
    event.set({ id: 'event', leaderboard_public: false });
    profile.set({ system_role: 'OWNER', roles: [] });
    expect(await guard()).toBe(true);
    profile.set({ system_role: 'MEMBER', roles: [{ event_id: 'event', role: 'EVENT_ADMIN' }] });
    expect(await guard()).toBe(true);
    profile.set({ system_role: 'MEMBER', roles: [{ event_id: 'other', role: 'EVENT_ADMIN' }] });
    expect(await guard()).not.toBe(true);
  });
});
