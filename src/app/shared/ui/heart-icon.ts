import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
export type HeartState = 'full' | 'half' | 'quarter' | 'three-quarter' | 'empty' | number;
/** Fixed red SVG artwork; half hearts show a crack and the missing half. */
@Component({
  selector: 'ds-heart-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './heart-icon.html',
  host: { 'aria-hidden': 'true', class: 'inline-flex shrink-0 align-middle' },
})
export class DsHeartIcon {
  readonly state = input<HeartState>('full');
  readonly size = input(24);
  readonly fraction = computed(() => {
    const state = this.state();
    return typeof state === 'number'
      ? Math.max(0, Math.min(1, state))
      : state === 'quarter'
        ? 0.25
        : state === 'three-quarter'
          ? 0.75
          : 0;
  });
}
