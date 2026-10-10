import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ds-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './button.html',
  host: { '[class.block]': 'fullWidth()' },
})
export class DsButton {
  readonly variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('primary');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly fullWidth = input(false);
}
