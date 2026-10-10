import { inject, Injectable } from '@angular/core';
import { ReadCacheService } from '../offline/read-cache.service';
import { OpQueueService } from '../offline/op-queue.service';
import type { LiveMutation, LiveSnapshot, MutationReceipt } from './live-types';

@Injectable({ providedIn: 'root' })
export class LiveApi {
  private readonly cache = inject(ReadCacheService);
  private readonly queue = inject(OpQueueService);
  admin(eventId: string): Promise<LiveSnapshot> {
    return this.cache.read('get_live_event', { p_event: eventId });
  }
  board(eventId: string): Promise<LiveSnapshot> {
    return this.cache.read('get_referee_board', { p_event: eventId });
  }
  match(matchId: string): Promise<LiveSnapshot> {
    return this.cache.read('get_match_entry', { p_match: matchId });
  }
  mutate<T = unknown>(
    name: LiveMutation,
    args: Record<string, unknown>,
  ): Promise<MutationReceipt<T>> {
    return this.queue.execute<T>(name, args);
  }
}
