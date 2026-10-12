import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { ViewerScope } from '../../core/player/viewer-scope';
import type { ScheduleRow } from './schedule-model';
import { localizedLocation, localizedName } from './public-helpers';

/** A schedule slot without a match: the game (or the team) is on a break that round. */
@Component({
  selector: 'app-break-card',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './break-card.html',
})
export class BreakCard {
  readonly row = input.required<ScheduleRow>();
  readonly direction = inject(DirectionService);
  /** Visitors open only their own team and no game pages (D046). */
  readonly scope = inject(ViewerScope);
  readonly name = localizedName;
  readonly location = localizedLocation;
}
