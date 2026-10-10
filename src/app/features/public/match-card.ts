import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import type { PublicMatch } from '../../core/player/public-types';
import { DsAvatar } from '../../shared/ui/avatar';
import { gameImage, localizedLocation, localizedName } from './public-helpers';

@Component({
  selector: 'app-public-match-card',
  imports: [RouterLink, TranslocoDirective, DsAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './match-card.html',
})
export class PublicMatchCard {
  readonly match = input.required<PublicMatch>();
  readonly selectedCode = input('');
  private readonly store = inject(EventStore);
  readonly direction = inject(DirectionService);
  readonly game = computed(() =>
    this.store.games().find((game) => game.id === this.match().game_id),
  );
  readonly round = computed(() =>
    this.store.rounds().find((round) => round.id === this.match().round_id),
  );
  readonly teams = computed(() =>
    this.match().participants.map((participant) => ({
      ...participant,
      team: this.store.teams().find((team) => team.id === participant.team_id),
    })),
  );
  readonly name = localizedName;
  readonly location = localizedLocation;
  readonly image = gameImage;
}
