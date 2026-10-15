import { ChangeDetectionStrategy, Component, input } from '@angular/core';
export type HeartState = 'full' | 'half' | 'empty';
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
}
