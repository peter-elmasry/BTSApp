import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { PublicMatchCard } from './match-card';
import { gameImage, localizedLocation, localizedName } from './public-helpers';
import { PublicState } from './public-state';

@Component({
  selector: 'app-game-detail-page',
  imports: [RouterLink, TranslocoDirective, PublicMatchCard, PublicState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-detail-page.html',
})
export class GameDetailPage {
  readonly store = inject(EventStore);
  readonly direction = inject(DirectionService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly game = computed(() =>
    this.store.games().find((game) => game.code === this.params().get('code')?.toUpperCase()),
  );
  readonly groups = computed(() =>
    [...this.store.rounds()]
      .sort((a, b) => a.number - b.number)
      .map((round) => ({
        round,
        matches: this.store
          .schedule()
          .filter((match) => match.game_id === this.game()?.id && match.round_id === round.id),
      }))
      .filter((group) => group.matches.length),
  );
  readonly name = localizedName;
  readonly location = localizedLocation;
  readonly image = gameImage;
  constructor() {
    void this.store.initialize();
  }
}
