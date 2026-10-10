import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { PublicApi } from '../player/public-api';

export function serverClockOffset(serverMs: number, sentMs: number, receivedMs: number): number {
  return serverMs - (sentMs + receivedMs) / 2;
}

export function roundCountdown(
  endsAt: string | null,
  nowMs: number,
): { seconds: number; overtime: boolean } {
  const endMs = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (!Number.isFinite(endMs)) return { seconds: 0, overtime: false };
  const difference = endMs - nowMs;
  return { seconds: Math.ceil(Math.abs(difference) / 1000), overtime: difference <= 0 };
}

@Injectable({ providedIn: 'root' })
export class ServerClockService {
  private readonly api = inject(PublicApi);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  readonly now = signal(Date.now());
  readonly synchronized = signal(false);
  private offset = 0;
  private pending?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private destroyed = false;

  constructor() {
    const visibility = () => {
      if (this.document.visibilityState === 'visible') void this.synchronize();
    };
    const online = () => void this.synchronize();
    this.document.addEventListener('visibilitychange', visibility);
    this.document.defaultView?.addEventListener('online', online);
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.timer !== undefined) clearInterval(this.timer);
      this.document.removeEventListener('visibilitychange', visibility);
      this.document.defaultView?.removeEventListener('online', online);
    });
  }

  synchronize(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.timer === undefined) this.timer = setInterval(() => this.tick(), 1000);
    this.pending = this.fetchTime().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async fetchTime() {
    const sent = Date.now();
    try {
      const server = Date.parse(await this.api.serverNow());
      const received = Date.now();
      if (this.destroyed || !Number.isFinite(server)) return;
      this.offset = serverClockOffset(server, sent, received);
      this.synchronized.set(true);
      this.tick();
    } catch {
      /* Keep the last offset and ticking while disconnected; retry on online/visibility. */
    }
  }

  private tick() {
    this.now.set(Date.now() + this.offset);
  }
}
