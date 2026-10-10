import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import { canSeeAllOutcomes, EventStore, redactMatchOutcomes } from '../../core/player/event.store';
import { PublicApi } from '../../core/player/public-api';
import type { PublicTeamView } from '../../core/player/public-types';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { EventChannelService } from '../../core/realtime/event-channel.service';

@Injectable()
export class TeamViewState {
  private readonly api = inject(PublicApi);
  private readonly eventStore = inject(EventStore);
  private readonly auth = inject(AuthStore);
  private readonly cache = inject(ReadCacheService);
  private readonly realtime = inject(EventChannelService);
  readonly code = signal('');
  private readonly result = signal<PublicTeamView | null>(null);
  private readonly responseContext = signal('');
  private readonly context = computed(() =>
    JSON.stringify([
      this.eventStore.event()?.id,
      this.code(),
      this.auth.session()?.user.id ?? null,
      this.auth.profile()?.system_role ?? null,
      this.auth.profile()?.roles ?? [],
    ]),
  );
  readonly view = computed(() => {
    if (this.responseContext() !== this.context()) return null;
    const result = this.result();
    if (!result || canSeeAllOutcomes(this.eventStore.event(), this.auth.profile())) return result;
    return { ...result, matches: redactMatchOutcomes(result.matches, this.code()) };
  });
  readonly loading = signal(false);
  readonly error = signal(false);
  private request = 0;
  private readonly refreshVersion = signal(0);

  constructor() {
    effect(() => {
      const event = this.eventStore.event();
      const code = this.code();
      const context = this.context();
      this.eventStore.schedule();
      this.refreshVersion();
      this.cache.updates();
      this.realtime.revision();
      const request = ++this.request;
      this.result.set(null);
      this.error.set(false);
      this.loading.set(false);
      if (!event || !code) return;
      this.loading.set(true);
      void this.api
        .teamView(event.id, code)
        .then((view) => {
          if (request === this.request && context === this.context()) {
            this.responseContext.set(context);
            this.result.set(view);
          }
        })
        .catch(() => {
          if (request === this.request) this.error.set(true);
        })
        .finally(() => {
          if (request === this.request) this.loading.set(false);
        });
    });
  }

  refresh() {
    this.refreshVersion.update((version) => version + 1);
  }
}
