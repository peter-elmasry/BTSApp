import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';

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
  return 12000 + Math.floor(random * 6000);
}
export interface ChannelHandle {
  close(): void;
}

@Injectable({ providedIn: 'root' })
export class EventChannelTransport {
  async connect(
    eventId: string,
    receive: (event: string, payload: unknown) => void,
    status: (value: string) => void,
  ): Promise<ChannelHandle> {
    const { supabase } = await import('../supabase/client');
    const channel = supabase.channel(`event:${eventId}`, { config: { private: false } });
    channel
      .on('broadcast', { event: '*' }, (message) => receive(message.event, message['payload']))
      .subscribe((value) => status(value));
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
  fallback?: ReturnType<typeof setTimeout>;
  poll?: ReturnType<typeof setTimeout>;
  debounce?: ReturnType<typeof setTimeout>;
}

@Injectable({ providedIn: 'root' })
export class EventChannelService {
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
      this.document.removeEventListener('visibilitychange', visibility);
      this.document.defaultView?.removeEventListener('online', online);
    });
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
    channel.fallback = setTimeout(() => {
      if (!channel.subscribed && !channel.disconnected) this.poll(channel);
    }, 10000);
    void this.transport
      .connect(
        eventId,
        (event, payload) => {
          if (generation !== channel.generation || !thinEventSignal(event, payload)) return;
          if (channel.debounce) clearTimeout(channel.debounce);
          channel.debounce = setTimeout(() => this.revision.update((value) => value + 1), 500);
        },
        (status) => {
          if (generation !== channel.generation) return;
          const wasSubscribed = channel.subscribed;
          channel.subscribed = status === 'SUBSCRIBED';
          if (channel.subscribed) {
            if (channel.fallback) clearTimeout(channel.fallback);
            if (channel.poll) clearTimeout(channel.poll);
            channel.poll = undefined;
            if (!wasSubscribed) this.revision.update((value) => value + 1);
          } else if (wasSubscribed) {
            channel.fallback = setTimeout(() => this.poll(channel), 10000);
          }
        },
      )
      .then((handle) => {
        if (generation !== channel.generation || this.destroyed) handle.close();
        else channel.handle = handle;
      })
      .catch(() => {
        /* The 10-second fallback also covers unavailable WebSocket transports. */
      });
  }
  private poll(channel: WatchedChannel) {
    if (channel.subscribed || channel.disconnected || this.destroyed) return;
    this.revision.update((value) => value + 1);
    channel.poll = setTimeout(() => this.poll(channel), pollingDelay());
  }
  private disconnect(channel: WatchedChannel) {
    ++channel.generation;
    channel.disconnected = true;
    channel.subscribed = false;
    channel.handle?.close();
    channel.handle = undefined;
    if (channel.fallback) clearTimeout(channel.fallback);
    if (channel.poll) clearTimeout(channel.poll);
    if (channel.debounce) clearTimeout(channel.debounce);
    channel.fallback = channel.poll = channel.debounce = undefined;
  }
}
