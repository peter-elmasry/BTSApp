import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth.store';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { EventStore } from '../../core/player/event.store';
import { PublicApi } from '../../core/player/public-api';
import type { PublicEvent, PublicTeamView } from '../../core/player/public-types';
import { EventChannelService } from '../../core/realtime/event-channel.service';
import { TeamViewState } from './team-view-state';

describe('cached team standing privacy', () => {
  it('removes standing and opponent metadata immediately when publication is disabled', async () => {
    const event = signal({ id: 'event', leaderboard_public: true } as PublicEvent);
    const response = {
      team: { id: 'one', code: 'T01' },
      standing: { rank: 1, total: 10 },
      matches: [
        {
          result_entered_at: '2026-10-10T12:00:00Z',
          participants: [
            { team_code: 'T01', outcome: 'WIN' },
            { team_code: 'T02', outcome: 'LOSS' },
          ],
        },
      ],
      adjustments: [],
    } as unknown as PublicTeamView;
    TestBed.configureTestingModule({
      providers: [
        TeamViewState,
        { provide: PublicApi, useValue: { teamView: async () => response } },
        { provide: EventStore, useValue: { event, schedule: signal([]) } },
        { provide: AuthStore, useValue: { session: signal(null), profile: signal(null) } },
        { provide: ReadCacheService, useValue: { updates: signal(0) } },
        { provide: EventChannelService, useValue: { revision: signal(0) } },
      ],
    });
    const state = TestBed.inject(TeamViewState);
    state.code.set('T01');
    TestBed.tick();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(state.view()?.standing?.total).toBe(10);
    event.update((current) => ({ ...current, leaderboard_public: false }));
    expect(state.view()).not.toHaveProperty('standing');
    expect(state.view()?.matches[0]).not.toHaveProperty('result_entered_at');
    expect(state.view()?.matches[0].participants.map((p) => p.outcome)).toEqual(['WIN', undefined]);
  });
});
