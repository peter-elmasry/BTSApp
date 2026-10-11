import { inject, Injectable } from '@angular/core';
import { OpQueueService } from '../offline/op-queue.service';
import { ReadCacheService } from '../offline/read-cache.service';
import { RpcTransport } from '../offline/rpc-transport';
import type { StandingRow, StandingsExport } from './standings-types';

@Injectable({ providedIn: 'root' })
export class StandingsApi {
  private readonly cache = inject(ReadCacheService);
  private readonly queue = inject(OpQueueService);
  private readonly transport = inject(RpcTransport);
  read(eventId: string, fresh = false): Promise<StandingRow[]> {
    return this.cache.read('get_standings', { p_event: eventId }, fresh);
  }
  export(eventId: string): Promise<StandingsExport> {
    return this.transport.rpc('get_export_data', { p_event: eventId });
  }
  visibility(eventId: string, value: boolean) {
    return this.queue.execute('set_leaderboard_visibility', { p_event: eventId, p_public: value });
  }
  tiebreak(eventId: string, teamIds: string[]) {
    return this.queue.execute('set_tiebreak', { p_event: eventId, p_team_ids: teamIds });
  }
}
