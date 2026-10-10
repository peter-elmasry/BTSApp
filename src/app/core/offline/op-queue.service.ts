import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';
import type { MutationReceipt } from '../live/live-types';
import { OfflineDb, type QueuedOperation } from './offline-db';
import {
  actorIdentity,
  isNetworkFailure,
  retryDelay,
  rpcFailure,
  type RpcFailure,
} from './rpc-errors';
import { RpcTransport } from './rpc-transport';
import { ReadCacheService, stableJson } from './read-cache.service';

export interface QueueFailure {
  opId: string;
  code: string;
  details?: unknown;
  message?: string;
}
function containsCredentials(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentials);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /password|token|secret|authorization/i.test(key) || containsCredentials(child),
  );
}

@Injectable({ providedIn: 'root' })
export class OpQueueService {
  private readonly database = inject(OfflineDb);
  private readonly transport = inject(RpcTransport);
  private readonly auth = inject(AuthStore);
  private readonly cache = inject(ReadCacheService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly owner = crypto.randomUUID();
  private readonly actor = computed(() =>
    actorIdentity(this.auth.session()?.user.id, this.auth.profile()?.id, environment.supabaseUrl),
  );
  private readonly queued = signal<{ actor: string | null; rows: QueuedOperation[] }>({
    actor: null,
    rows: [],
  });
  private readonly failed = signal<(QueueFailure & { actor: string })[]>([]);
  readonly operations = computed(() =>
    this.queued().actor === this.actor() ? this.queued().rows : [],
  );
  readonly pending = computed(() => this.operations().length);
  readonly failures = computed(() =>
    this.failed().filter((failure) => failure.actor === this.actor()),
  );
  readonly storageError = signal<string | null>(null);
  private readonly restoration = signal<{ actor: string | null; complete: boolean }>({
    actor: null,
    complete: false,
  });
  readonly ready = computed(() => {
    const actor = this.actor();
    return (
      !actor ||
      (this.restoration().actor === actor && this.restoration().complete && !this.storageError())
    );
  });
  private running?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    const online = () => {
      void this.reconnect();
    };
    const visible = () => {
      if (this.document.visibilityState === 'visible') void this.flush();
    };
    this.document.defaultView?.addEventListener('online', online);
    this.document.addEventListener('visibilitychange', visible);
    let previousActor: string | null = null;
    effect(() => {
      const actor = this.actor();
      untracked(() => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        this.restoration.set({ actor, complete: false });
        this.storageError.set(null);
        this.queued.set({ actor, rows: [] });
        if (previousActor && previousActor !== actor)
          void this.database.clearCache(previousActor, true).catch(() => {});
        previousActor = actor;
        void this.refreshPending();
        if (actor) void this.flush();
      });
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.timer) clearTimeout(this.timer);
      this.document.defaultView?.removeEventListener('online', online);
      this.document.removeEventListener('visibilitychange', visible);
    });
  }

  async execute<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    providedOpId?: string,
  ): Promise<MutationReceipt<T>> {
    await this.auth.initialize();
    const actor = this.actor();
    if (!actor) throw { code: 'UNAUTHENTICATED' };
    if (
      !/^[a-z_]+$/.test(name) ||
      /^(get_|list_|login|seed_|auth)/.test(name) ||
      containsCredentials(args)
    )
      throw { code: 'UNSAFE_QUEUED_OPERATION' };
    const id =
      providedOpId ?? (typeof args['p_op_id'] === 'string' ? args['p_op_id'] : crypto.randomUUID());
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw { code: 'INVALID_OP_ID' };
    const parameters = structuredClone({ ...args, p_op_id: id });
    try {
      const previous = await this.database.operation(id);
      if (previous) {
        if (
          previous.actor !== actor ||
          previous.name !== name ||
          stableJson(previous.args) !== stableJson(parameters)
        )
          throw { code: 'OP_ID_REUSED' };
      } else
        await this.database.enqueue({
          id,
          actor,
          name,
          args: parameters,
          createdAt: Date.now(),
          attempts: 0,
          nextAttempt: 0,
        });
      this.storageError.set(null);
    } catch (error) {
      if (rpcFailure(error).code === 'OP_ID_REUSED') throw error;
      this.storageError.set('OFFLINE_STORAGE_UNAVAILABLE');
      throw { code: 'OFFLINE_STORAGE_UNAVAILABLE' };
    }
    await this.refreshPending();
    await this.flush();
    const remaining = await this.database.operation(id);
    if (remaining && remaining.nextAttempt <= Date.now() && this.actor() === actor)
      await this.flush();
    if (this.actor() !== actor) return { status: 'queued', opId: id };
    const acknowledgment = await this.database.acknowledge(id, actor);
    if (acknowledgment?.error) throw acknowledgment.error;
    if (acknowledgment) return { status: 'sent', opId: id, data: acknowledgment.data as T };
    const stillQueued = await this.database.operation(id);
    return { status: stillQueued ? 'queued' : 'sent', opId: id };
  }

  flush(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.process()
      .catch(() => {
        this.storageError.set('OFFLINE_STORAGE_UNAVAILABLE');
      })
      .finally(async () => {
        this.running = undefined;
        await this.refreshPending();
        const first = this.operations()[0];
        if (
          first &&
          !this.timer &&
          !this.destroyed &&
          !this.storageError() &&
          (typeof navigator === 'undefined' || navigator.onLine)
        )
          this.retryAt(Math.max(Date.now(), first.nextAttempt));
      });
    return this.running;
  }
  dismissFailure(opId: string) {
    this.failed.update((failures) => failures.filter((failure) => failure.opId !== opId));
    const actor = this.actor();
    if (actor) void this.database.removeCache(`ack:${actor}:${opId}`).catch(() => {});
  }

  private async process() {
    await this.auth.initialize();
    if (this.destroyed || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const actor = this.actor();
    if (!actor) return;
    // Revalidate a restored staff profile before replay; the RPC still enforces current permissions.
    await this.auth.loadProfile();
    if (this.actor() !== actor || this.destroyed) return;
    while (this.actor() === actor && !this.destroyed) {
      const claim = await this.database.claim(actor, this.owner, Date.now());
      if (!claim.operation) {
        if (claim.waitUntil) this.retryAt(claim.waitUntil);
        break;
      }
      const operation = claim.operation;
      const renewal = setInterval(() => {
        void this.database.renew(actor, this.owner).catch(() => {});
      }, 10000);
      try {
        if (this.actor() !== actor) throw { code: 'ACTOR_CHANGED' };
        const data = await this.transport.mutate(operation.name, operation.args, actor);
        await this.database.finish(operation, this.owner, undefined, { data });
        if (this.actor() === actor) await this.cache.invalidate();
      } catch (error) {
        if (rpcFailure(error).code === 'ACTOR_CHANGED' || this.actor() !== actor) {
          await this.database.finish(operation, this.owner, {
            attempts: operation.attempts,
            nextAttempt: operation.nextAttempt,
          });
          break;
        }
        if (isNetworkFailure(error)) {
          const nextAttempt = Date.now() + retryDelay(operation.attempts);
          await this.database.finish(operation, this.owner, {
            attempts: operation.attempts + 1,
            nextAttempt,
          });
          this.retryAt(nextAttempt);
          break;
        }
        const failure = rpcFailure(error);
        await this.database.finish(operation, this.owner, undefined, { error: failure });
        this.failed.update((failures) => [
          ...failures,
          {
            actor,
            opId: operation.id,
            code:
              failure.code === 'P0001'
                ? (failure.message ?? 'REQUEST_FAILED')
                : (failure.code ?? failure.message ?? 'REQUEST_FAILED'),
            details: failure.details,
            message: failure.message,
          },
        ]);
      } finally {
        clearInterval(renewal);
      }
    }
    await this.refreshPending();
  }
  private retryAt(time: number) {
    if (this.timer) clearTimeout(this.timer);
    if (!this.destroyed)
      this.timer = setTimeout(
        () => {
          this.timer = undefined;
          void this.flush();
        },
        Math.max(0, time - Date.now()),
      );
  }
  private async reconnect() {
    await this.auth.initialize();
    const actor = this.actor();
    if (actor) await this.database.expedite(actor).catch(() => {});
    await this.flush();
  }
  private async refreshPending() {
    const actor = this.actor();
    if (!actor) {
      this.queued.set({ actor, rows: [] });
      this.restoration.set({ actor, complete: true });
      return;
    }
    try {
      const [operations, acknowledgments] = await Promise.all([
        this.database.operations(actor),
        this.database.acknowledgments(actor),
      ]);
      if (actor === this.actor()) {
        this.queued.set({ actor, rows: operations });
        this.restoration.set({ actor, complete: true });
        const restored = acknowledgments
          .filter((entry) => entry.ack.error)
          .map((entry) => ({
            actor,
            opId: entry.id,
            code:
              entry.ack.error!.code === 'P0001'
                ? (entry.ack.error!.message ?? 'REQUEST_FAILED')
                : (entry.ack.error!.code ?? entry.ack.error!.message ?? 'REQUEST_FAILED'),
            details: entry.ack.error!.details,
            message: entry.ack.error!.message,
          }));
        this.failed.update((failures) => [
          ...failures.filter((failure) => failure.actor !== actor),
          ...restored,
        ]);
      }
    } catch {
      if (actor === this.actor()) {
        this.restoration.set({ actor, complete: false });
        this.storageError.set('OFFLINE_STORAGE_UNAVAILABLE');
      }
    }
  }
}
