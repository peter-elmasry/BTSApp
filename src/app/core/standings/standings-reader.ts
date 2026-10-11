import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { ReadCacheService } from '../offline/read-cache.service';
import { rpcFailure } from '../offline/rpc-errors';
import { canSeeAllOutcomes, EventStore } from '../player/event.store';
import { EventChannelService } from '../realtime/event-channel.service';
import { StandingsApi } from './standings-api';
import type { StandingRow } from './standings-types';

@Injectable()
export class StandingsReader {
  private readonly api = inject(StandingsApi);
  private readonly auth = inject(AuthStore);
  private readonly events = inject(EventStore);
  private readonly cache = inject(ReadCacheService);
  private readonly realtime = inject(EventChannelService);
  readonly eventId = signal<string | null>(null);
  readonly allowed = computed(
    () =>
      !!this.eventId() &&
      this.events.event()?.id === this.eventId() &&
      canSeeAllOutcomes(this.events.event(), this.auth.profile()),
  );
  private readonly context = computed(() =>
    JSON.stringify([
      this.eventId(),
      this.events.event()?.leaderboard_public,
      this.auth.session()?.user.id,
      this.auth.profile()?.id,
      this.auth.profile()?.system_role,
      this.auth.profile()?.roles,
    ]),
  );
  private readonly result = signal<StandingRow[]>([]);
  private readonly responseContext = signal('');
  readonly rows = computed(() =>
    this.allowed() && this.responseContext() === this.context() ? this.result() : [],
  );
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly version = signal(0);
  private request = 0;

  constructor() {
    effect((cleanup) => {
      const id = this.eventId();
      if (id) cleanup(this.realtime.acquire(id));
    });
    effect(() => {
      const id = this.eventId();
      const context = this.context();
      const allowed = this.allowed();
      const version = this.version();
      const revision = this.realtime.revision();
      this.cache.updates();
      const request = ++this.request;
      this.loading.set(false);
      this.error.set('');
      if (!id || !allowed) {
        this.result.set([]);
        return;
      }
      this.loading.set(true);
      void this.api
        .read(id, version > 0 || revision > 0)
        .then((rows) => {
          if (request !== this.request || context !== this.context() || !this.allowed()) return;
          this.responseContext.set(context);
          this.result.set(rows);
        })
        .catch((error: unknown) => {
          if (request !== this.request || context !== this.context()) return;
          this.result.set([]);
          const failure = rpcFailure(error);
          this.error.set(
            failure.message === 'LEADERBOARD_HIDDEN' || failure.code === 'LEADERBOARD_HIDDEN'
              ? 'leaderboard.hidden'
              : 'standings.loadFailed',
          );
        })
        .finally(() => {
          if (request === this.request) this.loading.set(false);
        });
    });
  }
  refresh() {
    this.version.update((version) => version + 1);
  }
}
