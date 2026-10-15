import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { EventStore } from './event.store';
import { RegistrationApi, RegistrationReceipt } from './registration-api';

interface DeviceRegistration {
  secret: string;
  receipt: RegistrationReceipt | null;
}

@Injectable({ providedIn: 'root' })
export class RegistrationStore {
  private readonly api = inject(RegistrationApi);
  private readonly events = inject(EventStore);
  private readonly auth = inject(AuthStore);
  private readonly document = inject(DOCUMENT);
  private readonly revision = signal(0);
  private readonly memory = new Map<string, DeviceRegistration>();
  private readonly requests = new Map<string, Promise<void>>();
  readonly receipt = computed(() => {
    this.revision();
    if (this.auth.profile()) return null;
    const event = this.events.event()?.id;
    return event ? (this.read(event)?.receipt ?? null) : null;
  });

  constructor() {
    effect(() => {
      const event = this.events.event()?.id;
      if (event && !this.auth.profile()) void this.refresh(event);
    });
    const refresh = () => {
      const event = this.events.event()?.id;
      if (event && !this.auth.profile() && this.document.visibilityState !== 'hidden')
        void this.refresh(event);
    };
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('bts.registration.')) {
        this.memory.clear();
        this.revision.update((value) => value + 1);
        refresh();
      }
    };
    const timer = setInterval(refresh, 15000);
    this.document.addEventListener('visibilitychange', refresh);
    this.document.defaultView?.addEventListener('online', refresh);
    this.document.defaultView?.addEventListener('storage', storage);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', refresh);
      this.document.defaultView?.removeEventListener('online', refresh);
      this.document.defaultView?.removeEventListener('storage', storage);
    });
  }

  private key(event: string) {
    return `bts.registration.${event}`;
  }
  private read(event: string): DeviceRegistration | null {
    if (this.memory.has(event)) return this.memory.get(event)!;
    try {
      const value = JSON.parse(
        localStorage.getItem(this.key(event)) ?? 'null',
      ) as DeviceRegistration | null;
      if (!value || !/^[a-f0-9]{64}$/.test(value.secret)) return null;
      if (
        value.receipt &&
        (value.receipt.event_id !== event ||
          !['ACTIVE', 'REMOVED'].includes(value.receipt.status) ||
          typeof value.receipt.team_code !== 'string')
      )
        return null;
      this.memory.set(event, value);
      return value;
    } catch {
      return null;
    }
  }
  private write(event: string, value: DeviceRegistration) {
    // Joining needs durable storage: do not silently create an unrecognizable registration.
    try {
      localStorage.setItem(this.key(event), JSON.stringify(value));
    } catch {
      throw new Error('STORAGE_REQUIRED');
    }
    this.memory.set(event, value);
    this.revision.update((version) => version + 1);
  }
  private device(event: string) {
    const existing = this.read(event);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const value = {
      secret: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      receipt: null,
    };
    this.write(event, value);
    return value;
  }

  refresh(event: string): Promise<void> {
    if (this.auth.profile()) return Promise.resolve();
    const device = this.read(event);
    if (!device) return Promise.resolve();
    const existing = this.requests.get(event);
    if (existing) return existing;
    const request = this.api
      .rpc<RegistrationReceipt | null>('get_player_registration', {
        p_event: event,
        p_secret: device.secret,
      })
      .then((receipt) => {
        if (this.auth.profile() || this.read(event) !== device) return;
        // Keep a confirmed receipt on transient failures; only a successful read changes it.
        this.write(event, { ...device, receipt });
      })
      .catch(() => {})
      .finally(() => this.requests.delete(event));
    this.requests.set(event, request);
    return request;
  }

  async join(event: string, token: string, name: string, phone: string, opId: string) {
    const device = this.device(event);
    const receipt = await this.api.rpc<RegistrationReceipt>('join_team_invite', {
      p_op_id: opId,
      p_event: event,
      p_token: token,
      p_secret: device.secret,
      p_name: name,
      p_phone: phone || null,
    });
    this.write(event, { ...device, receipt });
    return receipt;
  }
}
