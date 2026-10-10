import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter, Router, UrlTree } from '@angular/router';
import { EventStore } from './event.store';
import { teamChosenGuard } from './player.guards';
import { TeamSelectionStore } from './team-selection.store';

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
        { provide: TeamSelectionStore, useValue: { selectedCode } },
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
