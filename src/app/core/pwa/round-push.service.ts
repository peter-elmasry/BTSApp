import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, timeout } from 'rxjs';
import { EventStore } from '../player/event.store';
import { DirectionService } from '../i18n/i18n.service';
import { PUSH_DEVICE_KEY, pushRequest, readPushDevice } from './round-push-api';

const PROMPT_KEY = 'bts.push.onboarding.v1';
function readPromptChoices(): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(PROMPT_KEY) ?? '[]');
    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string').slice(-50)
      : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class RoundPushService {
  private readonly push = inject(SwPush, { optional: true });
  private readonly events = inject(EventStore);
  private readonly direction = inject(DirectionService);
  readonly supported =
    !!this.push?.isEnabled &&
    typeof Notification !== 'undefined' &&
    'PushManager' in window &&
    window.isSecureContext;
  readonly permission = signal<NotificationPermission>(
    typeof Notification === 'undefined' ? 'default' : Notification.permission,
  );
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  private readonly registeredEvent = signal('');
  readonly enabled = computed(
    () =>
      this.permission() === 'granted' &&
      !!this.events.event()?.id &&
      this.registeredEvent() === this.events.event()?.id,
  );
  readonly eventName = computed(() => {
    const event = this.events.event();
    return this.direction.language() === 'ar' ? event?.name_ar || event?.name_en : event?.name_en;
  });
  readonly hasDevice = signal(!!readPushDevice());
  private readonly promptChoices = signal(readPromptChoices());
  readonly needsInstall =
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
    !window.matchMedia?.('(display-mode: standalone)').matches &&
    !(navigator as Navigator & { standalone?: boolean }).standalone;
  readonly prompt = computed(() => {
    const event = this.events.event();
    if (
      !event ||
      !['DRAFT', 'LIVE'].includes(event.status) ||
      this.enabled() ||
      this.promptChoices().includes(this.promptChoice(event.id))
    )
      return false;
    const saved = readPushDevice();
    if (this.hasDevice() && saved?.event === event.id && this.permission() === 'granted')
      return false;
    return this.needsInstall || (this.supported && this.ready());
  });
  private publicKey = '';
  private restoring = false;
  private generation = 0;

  constructor() {
    if (this.supported) void this.initialize();
    effect(() => {
      const event = this.events.event()?.id;
      const language = this.direction.language();
      if (event && this.ready()) untracked(() => void this.restore(event, language));
    });
    const changes = this.push?.pushSubscriptionChanges.subscribe(() => {
      this.registeredEvent.set('');
      if (this.events.event()?.id)
        void this.restore(this.events.event()!.id, this.direction.language());
    });
    const refresh = () => {
      this.permission.set(
        typeof Notification === 'undefined' ? 'default' : Notification.permission,
      );
      if (this.permission() !== 'granted') this.registeredEvent.set('');
    };
    const revoked = () => {
      this.generation++;
      this.registeredEvent.set('');
      this.hasDevice.set(false);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('bts:push-revoked', revoked);
    inject(DestroyRef).onDestroy(() => {
      changes?.unsubscribe();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('bts:push-revoked', revoked);
    });
  }

  async initialize() {
    this.error.set('');
    try {
      const config = await pushRequest({ action: 'config' });
      if (!/^[A-Za-z0-9_-]{87}$/.test(config.publicKey ?? '')) throw new Error('NOT_CONFIGURED');
      this.publicKey = config.publicKey!;
      this.ready.set(true);
    } catch {
      this.error.set('notReady');
    }
  }

  dismissPrompt(event = this.events.event()?.id) {
    if (!event) return;
    const key = this.promptChoice(event);
    const choices = [...this.promptChoices().filter((value) => value !== key), key].slice(-50);
    this.promptChoices.set(choices);
    try {
      localStorage.setItem(PROMPT_KEY, JSON.stringify(choices));
    } catch {
      // Still remember the choice for this session if device storage is unavailable.
    }
  }
  private promptChoice(event: string) {
    // Reading installation guidance must not dismiss consent in the installed app.
    return this.needsInstall ? `${event}:install` : event;
  }

  private async restore(event: string, language: string) {
    const saved = readPushDevice();
    if (
      !this.push ||
      !saved ||
      saved.event !== event ||
      saved.publicKey !== this.publicKey ||
      this.permission() !== 'granted' ||
      this.busy() ||
      this.restoring
    )
      return;
    this.restoring = true;
    const generation = this.generation;
    this.busy.set(true);
    try {
      const subscription = await firstValueFrom(this.push.subscription.pipe(timeout(35000)));
      if (!subscription) return;
      await pushRequest({
        action: 'subscribe',
        receipt: saved.receipt,
        event,
        language,
        subscription: subscription.toJSON(),
      });
      if (generation === this.generation) this.registeredEvent.set(event);
    } catch {
      this.error.set('saveFailed');
    } finally {
      this.restoring = false;
      this.busy.set(false);
    }
  }

  async enable() {
    const event = this.events.event()?.id;
    if (!this.supported || !this.push || !this.ready() || !event || this.busy() || this.restoring)
      return;
    this.busy.set(true);
    const generation = this.generation;
    this.error.set('');
    this.notice.set('');
    try {
      // Invoke immediately from the button gesture, before network work (required by Safari).
      const permission = await Notification.requestPermission();
      this.permission.set(permission);
      if (permission !== 'granted') {
        this.error.set(permission === 'denied' ? 'denied' : 'dismissed');
        return;
      }
      let saved = readPushDevice();
      if (!saved) {
        const receipt = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        saved = { receipt, event: '', publicKey: this.publicKey };
        localStorage.setItem(PUSH_DEVICE_KEY, JSON.stringify(saved));
      }
      this.hasDevice.set(true);
      const existing = await firstValueFrom(this.push.subscription.pipe(timeout(35000)));
      // Changing VAPID identity requires a fresh browser endpoint.
      const key = existing?.options?.applicationServerKey;
      const keyText = key
        ? btoa(String.fromCharCode(...new Uint8Array(key)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
        : saved.publicKey;
      if (existing && keyText !== this.publicKey) await this.push.unsubscribe();
      const subscription = await this.push.requestSubscription({ serverPublicKey: this.publicKey });
      await pushRequest({
        action: 'subscribe',
        receipt: saved.receipt,
        event,
        language: this.direction.language(),
        subscription: subscription.toJSON(),
      });
      if (generation !== this.generation) return;
      // Save the association only after confirmation; retain receipt after failures so retry is safe.
      localStorage.setItem(
        PUSH_DEVICE_KEY,
        JSON.stringify({ ...saved, event, publicKey: this.publicKey }),
      );
      this.registeredEvent.set(event);
      this.dismissPrompt(event);
      if (this.events.event()?.id === event) this.notice.set('saved');
    } catch {
      this.error.set('saveFailed');
    } finally {
      this.busy.set(false);
    }
  }

  async disable() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const saved = readPushDevice();
      const outcomes = await Promise.allSettled([
        saved ? pushRequest({ action: 'unsubscribe', receipt: saved.receipt }) : Promise.resolve(),
        (async () => {
          if (!this.supported || !this.push) throw new Error('UNAVAILABLE');
          const subscription = await firstValueFrom(this.push.subscription.pipe(timeout(5000)));
          if (subscription) await this.push.unsubscribe();
        })(),
      ]);
      // Either server revocation or local endpoint invalidation stops delivery.
      if (outcomes.every((outcome) => outcome.status === 'rejected'))
        throw new Error('REMOVE_FAILED');
      this.generation++;
      this.registeredEvent.set('');
      localStorage.removeItem(PUSH_DEVICE_KEY);
      this.hasDevice.set(false);
      this.notice.set('disabled');
      this.dismissPrompt();
    } catch {
      this.error.set('removeFailed');
    } finally {
      this.busy.set(false);
    }
  }

  async test() {
    const saved = readPushDevice();
    if (!saved || !this.enabled() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await pushRequest({ action: 'test', receipt: saved.receipt });
      this.notice.set('testQueued');
    } catch (error) {
      this.error.set(
        error instanceof Error && error.message === 'TEST_RATE_LIMITED'
          ? 'testLimit'
          : 'testFailed',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
