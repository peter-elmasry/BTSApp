import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type { RoundAudioCue } from '../audio/audio-types';
import { RpcTransport } from '../offline/rpc-transport';
import { ReadCacheService } from '../offline/read-cache.service';

export function thinRoundAudioSignal(
  event: string,
  payload: unknown,
): payload is RoundAudioCue & { type: 'round_audio' } {
  if (
    (event !== 'round_audio' && event !== '*') ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  )
    return false;
  const value = payload as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  return (
    value['type'] === 'round_audio' &&
    (value['cue'] === 'round-start' || value['cue'] === 'round-end') &&
    typeof value['cueId'] === 'string' &&
    uuid.test(value['cueId']) &&
    typeof value['roundId'] === 'string' &&
    uuid.test(value['roundId']) &&
    typeof value['occurredAt'] === 'string' &&
    Number.isFinite(Date.parse(value['occurredAt'])) &&
    Object.keys(value).length === 5 &&
    Object.keys(value).every((key) =>
      ['type', 'cueId', 'roundId', 'cue', 'occurredAt'].includes(key),
    )
  );
}

const changes = new Set([
  'match_changed',
  'round_changed',
  'adjustment_changed',
  'roster_changed',
  'settings_changed',
]);
const identifiers = new Set(['type', 'matchId', 'roundId']);
export function thinEventSignal(event: string, payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  const type = typeof value['type'] === 'string' ? value['type'] : event;
  return (
    changes.has(type) &&
    (event === type || event === '*') &&
    Object.entries(value).every(([key, item]) => identifiers.has(key) && typeof item === 'string')
  );
}
export function pollingDelay(random = Math.random()): number {
  return 4000 + Math.floor(random * 1000);
}
export interface ChannelHandle {
  close(): void;
}

@Injectable({ providedIn: 'root' })
export class EventChannelTransport {
  private readonly rpc = inject(RpcTransport);
  private readonly cache = inject(ReadCacheService);
  needsRecovery() {
    return this.cache.needsRecovery();
  }
  probe(eventId: string): Promise<string> {
    return this.rpc.rpc('get_event_update_token', {
      p_event: eventId === 'current' ? null : eventId,
    });
  }
  async connect(
    eventId: string,
    receive: (event: string, payload: unknown) => void,
    status: (value: string) => void,
  ): Promise<ChannelHandle> {
    const { supabase } = await import('../supabase/client');
    let joined = false;
    let replicationReady = false;
    const channel = supabase.channel(`event:${eventId}`, {
      config: { private: false, broadcast: { replication_ready: true } },
    });
    channel
      .on('broadcast', { event: '*' }, (message) => receive(message.event, message['payload']))
      .on('system', {}, (message) => {
        if (message.extension !== 'system') return;
        replicationReady = message.status === 'ok';
        status(replicationReady && joined ? 'SUBSCRIBED' : 'CHANNEL_ERROR');
      })
      .subscribe((value) => {
        joined = value === 'SUBSCRIBED';
        if (!joined) replicationReady = false;
        status(joined && !replicationReady ? 'CONNECTING' : value);
      });
    return {
      close: () => {
        void supabase.removeChannel(channel);
      },
    };
  }
}
interface WatchedChannel {
  refs: number;
  shell: boolean;
  subscribed: boolean;
  disconnected: boolean;
  generation: number;
  handle?: ChannelHandle;
  poll?: ReturnType<typeof setTimeout>;
  debounce?: ReturnType<typeof setTimeout>;
  token?: string;
  failures: number;
}

@Injectable({ providedIn: 'root' })
export class EventChannelService {
  private readonly immediateMessages = new Subject<{
    eventId: string;
    event: string;
    payload: unknown;
  }>();
  readonly immediate = this.immediateMessages.asObservable();
  isSubscribed(eventId: string) {
    return this.channels.get(eventId)?.subscribed ?? false;
  }
  private readonly transport = inject(EventChannelTransport);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  readonly revision = signal(0);
  private readonly channels = new Map<string, WatchedChannel>();
  private shellEvent: string | null = null;
  private hiddenTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    const visibility = () => {
      if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
      if (this.document.visibilityState === 'hidden') {
        this.hiddenTimer = setTimeout(
          () => this.channels.forEach((channel) => this.disconnect(channel)),
          60000,
        );
      } else {
        this.revision.update((value) => value + 1);
        this.channels.forEach((channel, eventId) => {
          if (channel.disconnected) this.connect(eventId, channel);
        });
      }
    };
    const online = () => {
      this.revision.update((value) => value + 1);
      if (this.document.visibilityState === 'hidden') return;
      this.channels.forEach((channel, eventId) => {
        if (!channel.subscribed) {
          this.disconnect(channel);
          this.connect(eventId, channel);
        }
      });
    };
    this.document.addEventListener('visibilitychange', visibility);
    this.document.defaultView?.addEventListener('online', online);
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
      this.channels.forEach((channel) => this.disconnect(channel));
      this.channels.clear();
      this.immediateMessages.complete();
      this.document.removeEventListener('visibilitychange', visibility);
      this.document.defaultView?.removeEventListener('online', online);
    });
    // A live socket does not prove delivery. Keep one recovery timer per watched event.
  }
  watch(eventId: string | null): void {
    if (eventId === this.shellEvent) return;
    if (this.shellEvent) {
      const previous = this.channels.get(this.shellEvent);
      if (previous) {
        previous.shell = false;
        this.release(this.shellEvent, previous);
      }
    }
    this.shellEvent = eventId;
    if (eventId) this.ensure(eventId).shell = true;
  }
  acquire(eventId: string): () => void {
    const channel = this.ensure(eventId);
    channel.refs++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      channel.refs--;
      this.release(eventId, channel);
    };
  }
  private ensure(eventId: string): WatchedChannel {
    const existing = this.channels.get(eventId);
    if (existing) return existing;
    const channel: WatchedChannel = {
      refs: 0,
      shell: false,
      subscribed: false,
      disconnected: true,
      generation: 0,
      failures: 0,
    };
    this.channels.set(eventId, channel);
    if (this.document.visibilityState !== 'hidden') this.connect(eventId, channel);
    return channel;
  }
  private release(eventId: string, channel: WatchedChannel) {
    if (channel.refs || channel.shell) return;
    this.disconnect(channel);
    this.channels.delete(eventId);
  }
  private connect(eventId: string, channel: WatchedChannel) {
    if (this.destroyed) return;
    const generation = ++channel.generation;
    channel.disconnected = false;
    this.revision.update((value) => value + 1);
    channel.poll = setTimeout(() => this.poll(eventId, channel), pollingDelay());
    void this.transport
      .connect(
        eventId,
        (event, payload) => {
          if (generation !== channel.generation || this.document.visibilityState === 'hidden')
            return;
          if (thinRoundAudioSignal(event, payload)) {
            this.immediateMessages.next({ eventId, event: 'round_audio', payload });
            return;
          }
          if (!thinEventSignal(event, payload)) return;
          const type = (payload as { type?: string }).type ?? event;
          this.immediateMessages.next({ eventId, event: type, payload });
          if (!channel.debounce)
            channel.debounce = setTimeout(() => {
              channel.debounce = undefined;
              this.revision.update((value) => value + 1);
            }, 250);
        },
        (status) => {
          if (generation !== channel.generation) return;
          const wasSubscribed = channel.subscribed;
          channel.subscribed = status === 'SUBSCRIBED';
          if (channel.subscribed && !wasSubscribed) {
            this.revision.update((value) => value + 1);
          }
        },
      )
      .then((handle) => {
        if (generation !== channel.generation || this.destroyed) handle.close();
        else channel.handle = handle;
      })
      .catch(() => {
        /* Recovery probes also cover unavailable WebSocket transports. */
      });
  }
  private async poll(eventId: string, channel: WatchedChannel) {
    if (channel.disconnected || this.destroyed) return;
    const generation = channel.generation;
    if (
      this.document.visibilityState !== 'hidden' &&
      this.document.defaultView?.navigator.onLine !== false
    ) {
      try {
        const token = await this.transport.probe(eventId);
        if (generation !== channel.generation) return;
        channel.failures = 0;
        if (token !== channel.token || this.transport.needsRecovery()) {
          channel.token = token;
          this.revision.update((value) => value + 1);
        }
      } catch {
        if (generation !== channel.generation) return;
        channel.failures = Math.min(channel.failures + 1, 3);
      }
    }
    if (generation === channel.generation)
      channel.poll = setTimeout(
        () => this.poll(eventId, channel),
        Math.min(30000, pollingDelay() * 2 ** channel.failures),
      );
  }
  private disconnect(channel: WatchedChannel) {
    ++channel.generation;
    channel.disconnected = true;
    channel.subscribed = false;
    channel.handle?.close();
    channel.handle = undefined;
    if (channel.poll) clearTimeout(channel.poll);
    if (channel.debounce) clearTimeout(channel.debounce);
    channel.poll = channel.debounce = undefined;
  }
}
