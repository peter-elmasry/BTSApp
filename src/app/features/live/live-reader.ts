import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { LiveApi } from '../../core/live/live-api';
import type { LiveSnapshot } from '../../core/live/live-types';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { EventChannelService } from '../../core/realtime/event-channel.service';
import { liveErrorKey } from './live-helpers';

@Injectable()
export class LiveReader {
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  private readonly channel = inject(EventChannelService);
  private readonly cache = inject(ReadCacheService);
  readonly source = signal<{ kind: 'admin' | 'board' | 'match'; id: string } | null>(null);
  private readonly context = computed(() =>
    JSON.stringify([
      this.source(),
      this.auth.session()?.user.id,
      this.auth.profile()?.system_role,
      this.auth.profile()?.roles,
      this.auth.profile()?.assigned_games,
    ]),
  );
  private readonly responseContext = signal('');
  private readonly result = signal<LiveSnapshot | null>(null);
  readonly data = computed(() =>
    this.responseContext() === this.context() ? this.result() : null,
  );
  private readonly eventId = computed(() =>
    this.source()?.kind === 'match' ? (this.data()?.event.id ?? null) : (this.source()?.id ?? null),
  );
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly version = signal(0);
  private request = 0;

  constructor() {
    effect((onCleanup) => {
      const eventId = this.eventId();
      if (eventId) onCleanup(this.channel.acquire(eventId));
    });
    effect(() => {
      const source = this.source();
      const context = this.context();
      this.channel.revision();
      this.cache.updates();
      this.version();
      const request = ++this.request;
      this.error.set('');
      if (!source?.id || !this.auth.session()) {
        this.result.set(null);
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.api[source.kind](source.id)
        .then((snapshot) => {
          if (request !== this.request || context !== this.context()) return;
          this.responseContext.set(context);
          this.result.set(snapshot);
        })
        .catch((error: unknown) => {
          if (request === this.request && context === this.context()) {
            this.result.set(null);
            this.error.set(liveErrorKey(error));
          }
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
