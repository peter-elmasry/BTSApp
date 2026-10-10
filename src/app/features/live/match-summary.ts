import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import type { LiveMatch, LiveSnapshot } from '../../core/live/live-types';
import { DsAvatar } from '../../shared/ui/avatar';
import { localizedLocation, localizedName } from '../public/public-helpers';

@Component({
  selector: 'app-live-match-summary',
  imports: [TranslocoDirective, DsAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './match-summary.html',
})
export class LiveMatchSummary {
  readonly snapshot = input.required<LiveSnapshot>();
  readonly match = input.required<LiveMatch>();
  readonly direction = inject(DirectionService);
  readonly game = computed(() =>
    this.snapshot().games.find((game) => game.id === this.match().game_id),
  );
  readonly round = computed(() =>
    this.snapshot().rounds.find((round) => round.id === this.match().round_id),
  );
  readonly teams = computed(() =>
    this.match().participants.map((participant) => ({
      ...participant,
      team: this.snapshot().teams.find((team) => team.id === participant.team_id),
    })),
  );
  readonly name = localizedName;
  readonly location = localizedLocation;
}
