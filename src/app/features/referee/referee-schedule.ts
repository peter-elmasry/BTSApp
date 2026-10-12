import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import type { PublicMatch } from '../../core/player/public-types';
import { localizedName } from '../public/public-helpers';
import { sortedRounds } from '../public/schedule-model';

/**
 * Round × game table of the signed-in referee's games. An empty cell is a break (D037).
 * Uses the public schedule, so hidden outcomes stay hidden; only who plays where is shown.
 */
@Component({
  selector: 'app-referee-schedule',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './referee-schedule.html',
})
export class RefereeSchedule {
  private readonly events = inject(EventStore);
  private readonly auth = inject(AuthStore);
  readonly direction = inject(DirectionService);
  readonly name = localizedName;
  readonly games = computed(() => {
    const eventId = this.events.event()?.id;
    const profile = this.auth.profile();
    const assigned = new Set(
      (profile?.assigned_games ?? [])
        .filter((item) => item.event_id === eventId)
        .map((item) => item.game_id),
    );
    const games = this.events.games();
    if (assigned.size) return games.filter((game) => assigned.has(game.id));
    // Event administrators without their own assignments oversee every game.
    const admin =
      profile?.system_role === 'OWNER' ||
      !!profile?.roles.some((role) => role.event_id === eventId && role.role === 'EVENT_ADMIN');
    return admin ? games : [];
  });
  readonly rows = computed(() => {
    const schedule = this.events.schedule();
    return sortedRounds(this.events.rounds())
      .map((round) => ({
        round,
        cells: this.games().map((game) => ({
          game,
          match:
            schedule.find((match) => match.round_id === round.id && match.game_id === game.id) ??
            null,
        })),
      }))
      .filter((row) => row.round.type !== 'OPENING' || row.cells.some((cell) => cell.match));
  });
  teams(match: PublicMatch) {
    const language = this.direction.language();
    return match.participants.map(
      (participant) =>
        this.name(
          this.events.teams().find((team) => team.id === participant.team_id),
          language,
        ) || participant.team_code,
    );
  }
}
