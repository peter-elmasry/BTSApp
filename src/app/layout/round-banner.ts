import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../core/auth/auth.store';
import { DirectionService } from '../core/i18n/i18n.service';
import { EventStore } from '../core/player/event.store';
import { roundCountdown, ServerClockService } from '../core/time/server-clock.service';
import { localizedName } from '../features/public/public-helpers';
import { formatClock } from '../shared/ui/timer-ring';
import { isEventAdmin, isEventReferee } from './navigation';
import { nextDraftRound } from './now-model';
import { NowSheet } from './now-sheet';

@Component({
  selector: 'app-round-banner',
  imports: [TranslocoDirective, NowSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './round-banner.html',
})
export class RoundBanner {
  readonly events = inject(EventStore);
  readonly clock = inject(ServerClockService);
  private readonly auth = inject(AuthStore);
  private readonly direction = inject(DirectionService);
  readonly open = signal(false);
  readonly activeRound = computed(() =>
    this.events.rounds().find((round) => round.status === 'ACTIVE'),
  );
  /** Staff see the next round to start when nothing is running. */
  readonly nextRound = computed(() => {
    const eventId = this.events.event()?.id ?? null;
    const profile = this.auth.profile();
    if (this.activeRound()) return null;
    if (!isEventAdmin(profile, eventId) && !isEventReferee(profile, eventId)) return null;
    return nextDraftRound(this.events.rounds());
  });
  readonly countdown = computed(() =>
    roundCountdown(this.activeRound()?.ends_at ?? null, this.clock.now()),
  );
  readonly overtime = computed(() => this.countdown().overtime);
  readonly timer = computed(() => {
    if (!this.activeRound()?.ends_at) return '—';
    const { seconds, overtime } = this.countdown();
    return formatClock(seconds, overtime);
  });
  roundName(round: { name_en: string | null; name_ar: string | null }) {
    return localizedName(round, this.direction.language());
  }
}
