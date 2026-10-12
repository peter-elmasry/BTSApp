import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** Row of life symbols: remaining lives in full colour, lost ones faded (LIVES mode). */
@Component({
  selector: 'ds-lives-meter',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lives-meter.html',
  host: { class: 'inline-flex flex-wrap items-center gap-1' },
})
export class DsLivesMeter {
  readonly lives = input.required<number>();
  readonly initial = input.required<number>();
  readonly emoji = input('❤️');
  /** Up to 12 symbols are drawn; larger counts use "emoji × n". */
  readonly icons = computed(() => {
    const slots = Math.max(this.lives(), this.initial());
    if (slots > 12) return null;
    return Array.from({ length: slots }, (_, index) => index < this.lives());
  });
}
