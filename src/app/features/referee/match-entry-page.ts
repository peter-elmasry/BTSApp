import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { AdjustmentsPanel } from '../live/adjustments-panel';
import { LiveReader } from '../live/live-reader';
import { LiveMatchSummary } from '../live/match-summary';
import { ResultEntry } from '../live/result-entry';

/**
 * One match at the station: summary, the shared result entry (inline review, offline
 * queue) and bonuses/penalties behind a button. A confirmed result returns to the
 * station, which names the next match (U5).
 */
@Component({
  selector: 'app-match-entry-page',
  imports: [RouterLink, TranslocoDirective, AdjustmentsPanel, LiveMatchSummary, ResultEntry],
  providers: [LiveReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './match-entry-page.html',
})
export class MatchEntryPage {
  readonly reader = inject(LiveReader);
  private readonly auth = inject(AuthStore);
  private readonly queue = inject(OpQueueService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly id = computed(() => this.params().get('id') ?? '');
  readonly match = computed(
    () => this.reader.data()?.matches.find((match) => match.id === this.id()) ?? null,
  );
  readonly adjustmentCount = computed(
    () =>
      this.reader
        .data()
        ?.adjustments.filter((item) => item.match_id === this.id() && !item.revoked_at).length ?? 0,
  );
  readonly showAdjustments = signal(false);
  private readonly waiting = signal(false);
  private readonly actorContext = computed(() =>
    JSON.stringify([
      this.auth.session()?.user.id,
      this.auth.profile()?.system_role,
      this.auth.profile()?.roles,
      this.auth.profile()?.assigned_games,
    ]),
  );

  constructor() {
    effect(() => {
      this.actorContext();
      this.reader.source.set({ kind: 'match', id: this.id() });
      this.showAdjustments.set(false);
      this.waiting.set(false);
    });
    effect(() => {
      if (this.waiting() && this.queue.pending() === 0) {
        this.waiting.set(false);
        this.reader.refresh();
      }
    });
  }

  saved(status: 'sent' | 'queued') {
    if (status === 'queued') {
      this.waiting.set(true);
      return;
    }
    void this.router.navigate(['/ref'], { queryParams: { saved: this.id() } });
  }
}
