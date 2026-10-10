import { inject, Injectable } from '@angular/core';
import { ReadCacheService } from '../offline/read-cache.service';
import type { PublicBootstrap, PublicEvent, PublicMatch, PublicTeamView } from './public-types';

@Injectable({ providedIn: 'root' })
export class PublicApi {
  private readonly cache = inject(ReadCacheService);
  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.cache.read<T>(name, args);
  }
  currentEvent() {
    return this.rpc<PublicEvent | null>('get_current_event');
  }
  bootstrap(eventId: string) {
    return this.rpc<PublicBootstrap>('get_bootstrap', { p_event: eventId });
  }
  schedule(eventId: string) {
    return this.rpc<PublicMatch[]>('get_schedule', { p_event: eventId });
  }
  teamView(eventId: string, code: string) {
    return this.rpc<PublicTeamView>('get_team_view', { p_event: eventId, p_team_code: code });
  }
  serverNow() {
    return this.rpc<string>('server_now');
  }
}
