import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { RpcTransport } from '../offline/rpc-transport';
import { rpcFailure } from '../offline/rpc-errors';
import { EventStore } from '../player/event.store';
import { EventChannelService } from '../realtime/event-channel.service';
import { ToastService } from '../../shared/ui/toast';
import { EventAudioService } from './event-audio.service';
import { freshAudio } from './audio-types';

interface TestResponse {
  serverNow: string;
  test: { id: string; occurredAt: string } | null;
}

@Injectable({ providedIn: 'root' })
export class SharedNotificationTestService {
  private readonly events = inject(EventStore);
  private readonly auth = inject(AuthStore);
  private readonly rpc = inject(RpcTransport);
  private readonly channel = inject(EventChannelService);
  private readonly audio = inject(EventAudioService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  readonly busy = signal(false);
  readonly cooling = signal(false);
  readonly error = signal('');
  readonly devices = signal<number | null>(null);
  readonly canSend = computed(() => {
    const event = this.events.event();
    const profile = this.auth.profile();
    return (
      !!event &&
      ['DRAFT', 'LIVE'].includes(event.status) &&
      (profile?.system_role === 'OWNER' ||
        !!profile?.roles.some((role) => role.event_id === event.id && role.role === 'EVENT_ADMIN'))
    );
  });
  private readonly visible = signal(this.document.visibilityState !== 'hidden');
  private context = '';
  private eventContext = '';
  private generation = 0;
  private baseline = false;
  private lastId: string | null = null;
  private flight = false;
  private failures = 0;
  private again = false;
  private retry?: ReturnType<typeof setTimeout>;
  private cooldown?: ReturnType<typeof setTimeout>;
  private operation?: { event: string; id: string };

  constructor() {
    effect(() => {
      const event = this.events.event()?.id;
      const visible = this.visible();
      this.channel.revision();
      const context = `${event}:${visible}`;
      untracked(() => {
        if (context !== this.context) {
          this.context = context;
          this.generation++;
          this.baseline = false;
          this.lastId = null;
          this.flight = this.again = false;
          this.failures = 0;
          clearTimeout(this.retry);
          if (this.eventContext !== (event ?? '')) {
            this.eventContext = event ?? '';
            this.devices.set(null);
            this.error.set('');
            this.cooling.set(false);
            clearTimeout(this.cooldown);
          }
        }
        if (event && visible) void this.read(event, this.generation);
      });
    });
    const updates = this.channel.immediate.subscribe((message) => {
      if (
        message.eventId === this.events.event()?.id &&
        message.event === 'settings_changed' &&
        this.visible()
      )
        void this.read(message.eventId, this.generation);
    });
    const visibility = () => this.visible.set(this.document.visibilityState !== 'hidden');
    this.document.addEventListener('visibilitychange', visibility);
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      updates.unsubscribe();
      clearTimeout(this.retry);
      clearTimeout(this.cooldown);
      this.document.removeEventListener('visibilitychange', visibility);
    });
  }

  async send() {
    const event = this.events.event()?.id;
    if (!event || !this.canSend() || this.busy() || this.cooling()) return;
    this.busy.set(true);
    this.error.set('');
    this.devices.set(null);
    if (this.operation?.event !== event) this.operation = { event, id: crypto.randomUUID() };
    try {
      const result = await this.rpc.rpc<{ devices: number }>('test_event_notifications', {
        p_event: event,
        p_op_id: this.operation.id,
      });
      this.operation = undefined;
      if (this.events.event()?.id !== event) return;
      this.devices.set(result.devices);
      this.startCooldown();
      void this.read(event, this.generation);
    } catch (error) {
      if (this.events.event()?.id !== event) return;
      const failure = rpcFailure(error);
      const code = failure.message ?? failure.code;
      this.error.set(
        code === 'TEST_RATE_LIMITED'
          ? 'sharedLimit'
          : code === 'FORBIDDEN'
            ? 'sharedForbidden'
            : code === 'EVENT_UNAVAILABLE'
              ? 'sharedUnavailable'
              : 'sharedFailed',
      );
      if (code === 'TEST_RATE_LIMITED') this.startCooldown();
    } finally {
      this.busy.set(false);
    }
  }

  private startCooldown() {
    clearTimeout(this.cooldown);
    this.cooling.set(true);
    this.cooldown = setTimeout(() => this.cooling.set(false), 60000);
  }

  private async read(event: string, generation: number) {
    if (this.flight) {
      this.again = true;
      return;
    }
    this.flight = true;
    clearTimeout(this.retry);
    try {
      const result = await this.rpc.rpc<TestResponse>('get_notification_test', { p_event: event });
      if (generation !== this.generation || !this.visible()) return;
      this.failures = 0;
      const test = result?.test;
      const previous = this.lastId;
      this.lastId = test?.id ?? null;
      if (!this.baseline) {
        this.baseline = true;
        return;
      }
      if (
        !test ||
        test.id === previous ||
        !freshAudio(test.occurredAt, Date.parse(result.serverNow))
      )
        return;
      this.toast.show('audio.sharedReceived');
      this.audio.preview('round-start');
    } catch {
      if (generation === this.generation && this.visible() && ++this.failures <= 3)
        this.retry = setTimeout(
          () => void this.read(event, generation),
          2000 * 2 ** (this.failures - 1),
        );
    } finally {
      if (generation === this.generation) {
        this.flight = false;
        if (this.again) {
          this.again = false;
          void this.read(event, generation);
        }
      }
    }
  }
}
