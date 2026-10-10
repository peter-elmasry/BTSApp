import type { CachedRead, OperationAck, QueuedOperation, QueueClaim } from './offline-db';

/** Shared durable backing store for service tests; production always uses native IndexedDB. */
export class MemoryOfflineDb {
  readonly reads = new Map<string, CachedRead>();
  readonly rows = new Map<string, QueuedOperation>();
  readonly leases = new Map<string, { owner: string; expires: number }>();
  private sequence = 0;
  async cached(key: string) {
    return this.reads.get(key);
  }
  async cache(value: CachedRead) {
    this.reads.set(value.key, structuredClone(value));
  }
  async removeCache(key: string) {
    this.reads.delete(key);
  }
  async clearCache(scope?: string, privateOnly = false) {
    this.reads.forEach((value, key) => {
      if ((!scope || scope === value.scope) && (!privateOnly || value.private))
        this.reads.delete(key);
    });
  }
  async enqueue(operation: QueuedOperation) {
    if (this.rows.has(operation.id)) throw new Error('duplicate');
    this.rows.set(operation.id, structuredClone({ ...operation, sequence: ++this.sequence }));
  }
  async operation(id: string) {
    return this.rows.get(id);
  }
  async operations(actor: string) {
    return [...this.rows.values()]
      .filter((row) => row.actor === actor)
      .sort((a, b) => a.sequence! - b.sequence!);
  }
  async acknowledge(id: string, actor: string) {
    return this.reads.get(`ack:${actor}:${id}`)?.data as OperationAck | undefined;
  }
  async acknowledgments(actor: string) {
    const prefix = `ack:${actor}:`;
    return [...this.reads.values()]
      .filter((value) => value.scope === actor && value.key.startsWith(prefix))
      .map((value) => ({ id: value.key.slice(prefix.length), ack: value.data as OperationAck }));
  }
  async expedite(actor: string) {
    this.rows.forEach((row) => {
      if (row.actor === actor) row.nextAttempt = 0;
    });
  }
  async claim(actor: string, owner: string, now: number): Promise<QueueClaim> {
    const lease = this.leases.get(actor);
    if (lease && lease.owner !== owner && lease.expires > now) return { waitUntil: lease.expires };
    const operation = (await this.operations(actor))[0];
    if (!operation || operation.nextAttempt > now) return { waitUntil: operation?.nextAttempt };
    this.leases.set(actor, { owner, expires: now + 30000 });
    return { operation };
  }
  async renew(actor: string, owner: string) {
    if (this.leases.get(actor)?.owner === owner)
      this.leases.set(actor, { owner, expires: Date.now() + 30000 });
  }
  async finish(
    operation: QueuedOperation,
    owner: string,
    retry?: { attempts: number; nextAttempt: number },
    ack?: OperationAck,
  ) {
    if (this.leases.get(operation.actor)?.owner !== owner) return;
    if (retry) this.rows.set(operation.id, { ...operation, ...retry });
    else this.rows.delete(operation.id);
    if (ack)
      await this.cache({
        key: `ack:${operation.actor}:${operation.id}`,
        scope: operation.actor,
        private: true,
        updatedAt: Date.now(),
        data: ack,
      });
    this.leases.delete(operation.actor);
  }
}
