import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { OfflineDb, type CachedRead } from './offline-db';
import { RpcTransport } from './rpc-transport';
import { isNetworkFailure } from './rpc-errors';
import { environment } from '../../../environments/environment';

const allowedReads = new Set([
  'get_current_event',
  'get_bootstrap',
  'get_schedule',
  'get_team_view',
  'get_live_event',
  'get_referee_board',
  'get_match_entry',
  'get_event_setup',
  'list_events',
  'list_members',
]);
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

@Injectable({ providedIn: 'root' })
export class ReadCacheService {
  private readonly database = inject(OfflineDb);
  private readonly transport = inject(RpcTransport);
  private readonly auth = inject(AuthStore);
  readonly scope = computed(() =>
    stableJson({
      project: environment.supabaseUrl,
      user: this.auth.session()?.user.id ?? null,
      member: this.auth.profile()?.id ?? null,
      systemRole: this.auth.profile()?.system_role ?? null,
      roles: this.auth.profile()?.roles ?? [],
      games: this.auth.profile()?.assigned_games ?? [],
    }),
  );
  readonly lastUpdated = signal<number | null>(null);
  readonly stale = signal(false);
  readonly updates = signal(0);
  private readonly fetching = new Map<string, Promise<unknown>>();
  private previousScope: string | undefined;
  private generation = 0;

  constructor() {
    effect(() => {
      const scope = this.scope();
      if (this.previousScope !== undefined && this.previousScope !== scope) {
        this.lastUpdated.set(null);
        this.stale.set(false);
        void this.database.clearCache(this.previousScope, true).catch(() => {});
      }
      this.previousScope = scope;
    });
  }

  async read<T>(name: string, args: Record<string, unknown> = {}, fresh = false): Promise<T> {
    if (!allowedReads.has(name)) return this.transport.rpc<T>(name, args);
    const scope = this.scope();
    const key = stableJson([scope, name, args]);
    const cached = await this.database.cached(key).catch(() => undefined);
    if (scope !== this.scope()) throw { code: 'ACTOR_CHANGED' };
    if (cached && !fresh) {
      this.lastUpdated.set(cached.updatedAt);
      this.stale.set(true);
      if (typeof navigator === 'undefined' || navigator.onLine)
        void this.fetch<T>(name, args, key, scope, cached).catch(() => {});
      return cached.data as T;
    }
    try {
      return await this.fetch<T>(name, args, key, scope, cached);
    } catch (error) {
      if (cached && scope === this.scope() && isNetworkFailure(error)) {
        this.lastUpdated.set(cached.updatedAt);
        this.stale.set(true);
        return cached.data as T;
      }
      throw error;
    }
  }
  async invalidate(): Promise<void> {
    ++this.generation;
    this.fetching.clear();
    await this.database.clearCache(this.scope()).catch(() => {});
    this.updates.update((value) => value + 1);
  }
  private fetch<T>(
    name: string,
    args: Record<string, unknown>,
    key: string,
    scope: string,
    cached?: CachedRead,
  ): Promise<T> {
    const current = this.fetching.get(key);
    if (current) return current as Promise<T>;
    const generation = this.generation;
    const pending = this.transport
      .rpc<T>(name, args)
      .then(async (data) => {
        if (scope !== this.scope()) throw { code: 'ACTOR_CHANGED' };
        if (generation !== this.generation) throw { code: 'STALE_RESPONSE' };
        const updatedAt = Date.now();
        await this.database
          .cache({ key, scope, private: this.auth.session() !== null, data, updatedAt })
          .catch(() => {});
        if (scope !== this.scope()) {
          await this.database.removeCache(key).catch(() => {});
          throw { code: 'ACTOR_CHANGED' };
        }
        if (generation !== this.generation) throw { code: 'STALE_RESPONSE' };
        this.lastUpdated.set(updatedAt);
        this.stale.set(false);
        if (cached && stableJson(cached.data) !== stableJson(data))
          this.updates.update((value) => value + 1);
        return data;
      })
      .catch(async (error: unknown) => {
        if (generation !== this.generation || scope !== this.scope()) throw error;
        if (!isNetworkFailure(error)) {
          await this.database.removeCache(key).catch(() => {});
          if (cached && scope === this.scope()) this.updates.update((value) => value + 1);
        }
        throw error;
      })
      .finally(() => {
        if (this.fetching.get(key) === pending) this.fetching.delete(key);
      });
    this.fetching.set(key, pending);
    return pending;
  }
}
