import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EventStore } from './event.store';
import { TeamSelectionStore } from './team-selection.store';
import type { PublicEvent, PublicTeam } from './public-types';

describe('event-scoped player team choice', () => {
  const event = signal<PublicEvent | null>(null);
  const teams = signal<PublicTeam[]>([]);
  const roster = [
    { id: 't1', code: 'T01' },
    { id: 't2', code: 'T02' },
  ] as PublicTeam[];
  beforeEach(() => {
    localStorage.clear();
    event.set({ id: 'one' } as PublicEvent);
    teams.set(roster);
    TestBed.configureTestingModule({
      providers: [{ provide: EventStore, useValue: { event, teams } }],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores valid stored choices and refuses unknown teams', () => {
    localStorage.setItem('bts.team.one', 'T01');
    const store = TestBed.inject(TeamSelectionStore);
    expect(store.selectedCode()).toBe('T01');
    expect(store.selectedTeam()?.id).toBe('t1');
    expect(store.choose('T99')).toBe(false);
    expect(store.selectedCode()).toBe('T01');
    expect(store.choose('T02')).toBe(true);
    expect(localStorage.getItem('bts.team.one')).toBe('T02');
  });

  it('isolates choices by event and restores the previous event choice', () => {
    const store = TestBed.inject(TeamSelectionStore);
    store.choose('T01');
    event.set({ id: 'two' } as PublicEvent);
    expect(store.selectedCode()).toBeNull();
    store.choose('T02');
    event.set({ id: 'one' } as PublicEvent);
    expect(store.selectedCode()).toBe('T01');
    expect(localStorage.getItem('bts.team.two')).toBe('T02');
  });

  it('invalidates a removed team and clears stale persistent choices', () => {
    localStorage.setItem('bts.team.one', 'T99');
    const store = TestBed.inject(TeamSelectionStore);
    expect(store.selectedCode()).toBeNull();
    TestBed.tick();
    expect(localStorage.getItem('bts.team.one')).toBeNull();
    store.choose('T01');
    teams.set([roster[1]]);
    expect(store.selectedTeam()).toBeNull();
    TestBed.tick();
    teams.set(roster);
    expect(store.selectedCode()).toBeNull();
  });

  it('works in memory if browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = TestBed.inject(TeamSelectionStore);
    expect(store.choose('T01')).toBe(true);
    expect(store.selectedCode()).toBe('T01');
    event.set({ id: 'two' } as PublicEvent);
    store.choose('T02');
    event.set({ id: 'one' } as PublicEvent);
    expect(store.selectedCode()).toBe('T01');
    event.set(null);
    expect(store.selectedCode()).toBeNull();
    expect(store.choose('T01')).toBe(false);
  });
});
