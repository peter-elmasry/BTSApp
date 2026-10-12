import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { localizedName } from '../public/public-helpers';
import { TeamViewState } from '../public/team-view-state';
import { TeamBreakdown } from './team-breakdown';

export { ownOutcome } from './team-breakdown';

/** Drill-down sheet: a team's breakdown over the current screen (A7). */
@Component({
  selector: 'app-team-breakdown-sheet',
  imports: [TranslocoDirective, DsBottomSheet, TeamBreakdown],
  providers: [TeamViewState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ds-bottom-sheet
    *transloco="let t"
    size="full"
    [title]="title() || t('breakdown.title')"
    (close)="close.emit()"
  >
    <app-team-breakdown [code]="code()" (navigated)="close.emit()" />
  </ds-bottom-sheet>`,
})
export class TeamBreakdownSheet {
  readonly code = input.required<string>();
  readonly close = output<void>();
  private readonly events = inject(EventStore);
  private readonly direction = inject(DirectionService);
  private readonly state = inject(TeamViewState);
  readonly title = computed(() =>
    localizedName(
      this.state.view()?.team ?? this.events.teams().find((team) => team.code === this.code()),
      this.direction.language(),
    ),
  );
}
