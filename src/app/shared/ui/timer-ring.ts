import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { PublicRound } from '../../core/player/public-types';
import { roundCountdown, ServerClockService } from '../../core/time/server-clock.service';

type RingRound = Pick<PublicRound, 'status' | 'duration_min' | 'extension_min' | 'ends_at'>;

/** Remaining fraction (0–1) of an active round, 0 in overtime; null when not running. */
export function ringProgress(round: RingRound | null | undefined, nowMs: number): number | null {
  if (!round || round.status !== 'ACTIVE' || !round.ends_at) return null;
  const totalMs = (round.duration_min + round.extension_min) * 60_000;
  const remainingMs = Date.parse(round.ends_at) - nowMs;
  if (!Number.isFinite(remainingMs) || totalMs <= 0) return null;
  return Math.min(1, Math.max(0, remainingMs / totalMs));
}

export function formatClock(seconds: number, overtime: boolean): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  return `${overtime ? '+' : ''}${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/** Round timer as a depleting ring from the server clock; red and pulsing in overtime. */
@Component({
  selector: 'ds-timer-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="ds-timer-ring"
    role="timer"
    [class.overtime]="overtime()"
    [style.--ring-size.px]="size()"
  >
    <svg [attr.viewBox]="'0 0 36 36'" aria-hidden="true">
      <circle class="track" cx="18" cy="18" r="15.9" />
      <circle
        class="bar"
        cx="18"
        cy="18"
        r="15.9"
        pathLength="100"
        [style.stroke-dashoffset]="100 - (progress() ?? 0) * 100"
      />
    </svg>
    <span class="ds-timer-text tabular" dir="ltr">{{ text() }}</span>
  </span>`,
})
export class DsTimerRing {
  readonly round = input<RingRound | null | undefined>(null);
  readonly size = input(64);
  private readonly clock = inject(ServerClockService);
  readonly progress = computed(() => ringProgress(this.round(), this.clock.now()));
  readonly countdown = computed(() =>
    roundCountdown(this.round()?.ends_at ?? null, this.clock.now()),
  );
  readonly overtime = computed(
    () => this.round()?.status === 'ACTIVE' && this.countdown().overtime,
  );
  readonly text = computed(() => {
    if (this.round()?.status !== 'ACTIVE' || !this.round()?.ends_at) return '—';
    const { seconds, overtime } = this.countdown();
    return formatClock(seconds, overtime);
  });
}
