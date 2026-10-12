import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Outcome } from '../../core/player/public-types';

export const OUTCOME_ICONS: Record<Outcome, string> = {
  WIN: '✓',
  DRAW: '=',
  LOSS: '✗',
  FORFEIT: '⊘',
  PENDING: '…',
};

/** Match outcome as icon + word + colour (never colour alone). */
@Component({
  selector: 'ds-outcome',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span *transloco="let t" class="ds-outcome" [attr.data-outcome]="outcome()"
    ><span aria-hidden="true">{{ icons[outcome()] }}</span
    >{{ t('player.outcome.' + outcome()) }}</span
  >`,
})
export class DsOutcome {
  readonly outcome = input.required<Outcome>();
  readonly icons = OUTCOME_ICONS;
}
