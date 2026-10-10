import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { PublicApi } from './public-api';
import type { PublicEvent, PublicGame, PublicMatch, PublicRound, PublicTeam } from './public-types';

@Injectable({ providedIn: 'root' })
export class EventStore {
  private readonly api = inject(PublicApi);
  private readonly auth = inject(AuthStore);
  readonly event = signal<PublicEvent | null>(null);
  readonly teams = signal<PublicTeam[]>([]);
  readonly games = signal<PublicGame[]>([]);
  readonly rounds = signal<PublicRound[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  private readonly matches = signal<PublicMatch[]>([]);
  private readonly responseContext = signal('');
  private readonly authContext = computed(() =>
    JSON.stringify([
      this.auth.session()?.user.id ?? null,
      this.auth.profile()?.system_role ?? null,
      this.auth.profile()?.roles ?? [],
    ]),
  );
  // Permission changes hide an old response immediately, before the shell refresh effect runs.
  readonly schedule = computed(() =>
    this.responseContext() === this.authContext() ? this.matches() : [],
  );
  private generation = 0;
  private pending?: Promise<void>;

  initialize(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.loaded() && this.responseContext() === this.authContext()) return Promise.resolve();
    return this.refresh();
  }

  refresh(): Promise<void> {
    const generation = ++this.generation;
    let context = this.authContext();
    this.loading.set(true);
    this.error.set(null);
    this.matches.set([]);
    const current = () => generation === this.generation && context === this.authContext();
    const request = Promise.resolve().then(async () => {
      try {
        await this.auth.initialize();
        if (generation !== this.generation) return;
        context = this.authContext();
        const event = await this.api.currentEvent();
        if (!current()) return;
        if (!event) {
          this.clear();
          this.responseContext.set(context);
          this.loaded.set(true);
          return;
        }
        const [bootstrap, schedule] = await Promise.all([
          this.api.bootstrap(event.id),
          this.api.schedule(event.id),
        ]);
        if (!current()) return;
        this.teams.set(bootstrap.teams);
        this.games.set(bootstrap.games);
        this.rounds.set(bootstrap.rounds);
        this.event.set(event);
        this.responseContext.set(context);
        this.matches.set(schedule);
        this.loaded.set(true);
      } catch {
        if (!current()) return;
        this.clear();
        this.loaded.set(false);
        this.error.set('LOAD_FAILED');
      } finally {
        if (generation === this.generation) {
          this.loading.set(false);
          this.pending = undefined;
        }
      }
    });
    this.pending = request;
    return request;
  }

  private clear() {
    this.event.set(null);
    this.teams.set([]);
    this.games.set([]);
    this.rounds.set([]);
    this.matches.set([]);
  }
}
