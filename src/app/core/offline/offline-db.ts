import { Injectable } from '@angular/core';

export interface CachedRead {
  key: string;
  scope: string;
  private: boolean;
  data: unknown;
  updatedAt: number;
}
export interface QueuedOperation {
  sequence?: number;
  id: string;
  actor: string;
  name: string;
  args: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  nextAttempt: number;
}
export interface QueueClaim {
  operation?: QueuedOperation;
  waitUntil?: number;
}
export interface OperationAck {
  data?: unknown;
  error?: { code?: string; message?: string; details?: unknown; hint?: string; status?: number };
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error('OFFLINE_STORAGE_UNAVAILABLE'));
  });
}

/** IndexedDB transactions serialize actor leases across tabs and commit before a mutation sends. */
@Injectable({ providedIn: 'root' })
export class OfflineDb {
  private database?: Promise<IDBDatabase>;
  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));
        return;
      }
      const opening = indexedDB.open('bts-offline-v1', 1);
      opening.onupgradeneeded = () => {
        const database = opening.result;
        database.createObjectStore('cache', { keyPath: 'key' });
        const operations = database.createObjectStore('operations', {
          keyPath: 'sequence',
          autoIncrement: true,
        });
        operations.createIndex('actor', 'actor');
        operations.createIndex('id', 'id', { unique: true });
        database.createObjectStore('leases', { keyPath: 'actor' });
      };
      opening.onsuccess = () => {
        opening.result.onversionchange = () => {
          opening.result.close();
          this.database = undefined;
        };
        resolve(opening.result);
      };
      opening.onerror = () => {
        this.database = undefined;
        reject(opening.error);
      };
      opening.onblocked = () => {
        this.database = undefined;
        reject(new Error('OFFLINE_STORAGE_BLOCKED'));
      };
    });
    return this.database;
  }
  async cached(key: string): Promise<CachedRead | undefined> {
    const database = await this.open();
    return request(database.transaction('cache').objectStore('cache').get(key));
  }
  async cache(value: CachedRead): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('cache', 'readwrite');
    const done = completed(transaction);
    transaction.objectStore('cache').put(value);
    await done;
  }
  async removeCache(key: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('cache', 'readwrite');
    const done = completed(transaction);
    transaction.objectStore('cache').delete(key);
    await done;
  }
  async clearCache(scope?: string, privateOnly = false): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('cache', 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('cache');
    store.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      const value = cursor.value as CachedRead;
      if ((!scope || value.scope === scope) && (!privateOnly || value.private)) cursor.delete();
      cursor.continue();
    };
    await done;
  }
  async enqueue(operation: QueuedOperation): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('operations', 'readwrite');
    const done = completed(transaction);
    transaction.objectStore('operations').add(operation);
    await done;
  }
  async operations(actor: string): Promise<QueuedOperation[]> {
    const database = await this.open();
    return request(
      database.transaction('operations').objectStore('operations').index('actor').getAll(actor),
    );
  }
  async operation(id: string): Promise<QueuedOperation | undefined> {
    const database = await this.open();
    return request(
      database.transaction('operations').objectStore('operations').index('id').get(id),
    );
  }
  async acknowledge(id: string, actor: string): Promise<OperationAck | undefined> {
    return (await this.cached(`ack:${actor}:${id}`))?.data as OperationAck | undefined;
  }
  async acknowledgments(actor: string): Promise<{ id: string; ack: OperationAck }[]> {
    const database = await this.open();
    const values = (await request(
      database.transaction('cache').objectStore('cache').getAll(),
    )) as CachedRead[];
    const prefix = `ack:${actor}:`;
    return values
      .filter((value) => value.scope === actor && value.key.startsWith(prefix))
      .map((value) => ({ id: value.key.slice(prefix.length), ack: value.data as OperationAck }));
  }
  async expedite(actor: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('operations', 'readwrite');
    const done = completed(transaction);
    const store = transaction.objectStore('operations');
    store.index('actor').openCursor(actor).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      cursor.update({ ...(cursor.value as QueuedOperation), nextAttempt: 0 });
      cursor.continue();
    };
    await done;
  }
  async claim(actor: string, owner: string, now: number): Promise<QueueClaim> {
    const database = await this.open();
    const transaction = database.transaction(['operations', 'leases'], 'readwrite');
    const done = completed(transaction);
    const leases = transaction.objectStore('leases');
    const lease = (await request(leases.get(actor))) as
      { owner: string; expires: number } | undefined;
    if (lease && lease.owner !== owner && lease.expires > now) {
      await done;
      return { waitUntil: lease.expires };
    }
    const operations = (await request(
      transaction.objectStore('operations').index('actor').getAll(actor),
    )) as QueuedOperation[];
    const first = operations[0];
    if (!first || first.nextAttempt > now) {
      leases.delete(actor);
      await done;
      return { waitUntil: first?.nextAttempt };
    }
    leases.put({ actor, owner, expires: now + 30000 });
    await done;
    return { operation: first };
  }
  async renew(actor: string, owner: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction('leases', 'readwrite');
    const done = completed(transaction);
    const leases = transaction.objectStore('leases');
    const lease = (await request(leases.get(actor))) as { owner: string } | undefined;
    if (lease?.owner === owner) leases.put({ actor, owner, expires: Date.now() + 30000 });
    await done;
  }
  async finish(
    operation: QueuedOperation,
    owner: string,
    retry?: { attempts: number; nextAttempt: number },
    ack?: OperationAck,
  ): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(['operations', 'leases', 'cache'], 'readwrite');
    const done = completed(transaction);
    const leases = transaction.objectStore('leases');
    const lease = (await request(leases.get(operation.actor))) as { owner: string } | undefined;
    if (lease?.owner === owner) {
      const store = transaction.objectStore('operations');
      if (retry) store.put({ ...operation, ...retry });
      else store.delete(operation.sequence!);
      if (ack)
        transaction.objectStore('cache').put({
          key: `ack:${operation.actor}:${operation.id}`,
          scope: operation.actor,
          private: true,
          updatedAt: Date.now(),
          data: ack,
        });
      leases.delete(operation.actor);
    }
    await done;
  }
}
