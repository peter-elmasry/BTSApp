import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventStore } from '../core/player/event.store';
import { roundCountdown, ServerClockService } from '../core/time/server-clock.service';

@Component({
  selector: 'app-round-banner',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './round-banner.html',
})
export class RoundBanner {
  readonly events = inject(EventStore);
  readonly clock = inject(ServerClockService);
  readonly activeRound = computed(() =>
    this.events.rounds().find((round) => round.status === 'ACTIVE'),
  );
  readonly countdown = computed(() =>
    roundCountdown(this.activeRound()?.ends_at ?? null, this.clock.now()),
  );
  readonly overtime = computed(() => this.countdown().overtime);
  readonly timer = computed(() => {
    if (!this.activeRound()?.ends_at) return '—';
    const { seconds, overtime } = this.countdown();
    return `${overtime ? '+' : ''}${Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  });
}
