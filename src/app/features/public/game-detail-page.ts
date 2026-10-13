import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import type { PublicMatch } from '../../core/player/public-types';
import { DsCellDef, DsDataTable, type DsColumn } from '../../shared/ui/data-table';
import { DsOutcome } from '../../shared/ui/outcome';
import { gameRows, type ScheduleRow } from './schedule-model';
import { gameImage, localizedLocation, localizedName, refereeNames } from './public-helpers';
import { PublicState } from './public-state';

@Component({
  selector: 'app-game-detail-page',
  imports: [RouterLink, TranslocoDirective, PublicState, DsDataTable, DsCellDef, DsOutcome],
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
  /** Every round of this game: its match, or a break when nothing is scheduled there. */
  readonly rows = computed(() => {
    const game = this.game();
    return game ? gameRows(this.store.rounds(), game, this.store.schedule()) : [];
  });
  readonly name = localizedName;
  readonly location = localizedLocation;
  readonly image = gameImage;
  readonly referees = refereeNames;
  readonly track = (row: ScheduleRow) => row.key;
  readonly searchText = (row: ScheduleRow) => (row.match ? this.teams(row.match) : '');
  constructor() {
    void this.store.initialize();
  }
  teamName(code: string) {
    return (
      this.name(
        this.store.teams().find((team) => team.code === code),
        this.direction.language(),
      ) || code
    );
  }
  teams(match: PublicMatch) {
    return match.participants.map((item) => this.teamName(item.team_code)).join(' · ');
  }
  columns(t: (key: string) => string): DsColumn<ScheduleRow>[] {
    return [
      { key: 'round', header: t('live.roundColumn'), rowHeader: true },
      { key: 'teams', header: t('player.teamsColumn') },
      { key: 'result', header: t('player.resultColumn'), priority: 2 },
    ];
  }
}
