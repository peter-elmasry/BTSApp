import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { PublicMatchCard } from './match-card';
import { localizedName } from './public-helpers';
import { PublicState } from './public-state';
import { TeamViewState } from './team-view-state';

type ScheduleTab = 'myTeam' | 'byRound' | 'byGame';
@Component({
  selector: 'app-schedule-page',
  imports: [TranslocoDirective, PublicMatchCard, PublicState],
  providers: [TeamViewState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schedule-page.html',
})
export class SchedulePage {
  readonly store = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly direction = inject(DirectionService);
  readonly teamView = inject(TeamViewState);
  readonly tab = signal<ScheduleTab>('myTeam');
  readonly tabs: ScheduleTab[] = ['myTeam', 'byRound', 'byGame'];
  readonly name = localizedName;
  readonly matches = computed(() => {
    const own = new Map((this.teamView.view()?.matches ?? []).map((match) => [match.id, match]));
    return this.store.schedule().map((match) => own.get(match.id) ?? match);
  });
  readonly groups = computed(() => {
    const matches =
      this.tab() === 'myTeam'
        ? this.matches().filter((match) =>
            match.participants.some(
              (participant) => participant.team_code === this.selection.selectedCode(),
            ),
          )
        : this.matches();
    if (this.tab() === 'byGame')
      return this.store
        .games()
        .map((game) => ({
          id: game.id,
          title: this.name(game, this.direction.language()),
          opening: false,
          round: null,
          matches: matches
            .filter((match) => match.game_id === game.id)
            .sort((a, b) => this.roundNumber(a.round_id) - this.roundNumber(b.round_id)),
        }))
        .filter((group) => group.matches.length);
    return [...this.store.rounds()]
      .sort((a, b) => a.number - b.number)
      .map((round) => ({
        id: round.id,
        title: this.name(round, this.direction.language()),
        opening: round.type === 'OPENING',
        round: round.number,
        matches: matches.filter((match) => match.round_id === round.id),
      }))
      .filter((group) => group.matches.length);
  });
  constructor() {
    void this.store.initialize();
    effect(() => this.teamView.code.set(this.selection.selectedCode() ?? ''));
  }
  private roundNumber(id: string) {
    return this.store.rounds().find((round) => round.id === id)?.number ?? 0;
  }
}
