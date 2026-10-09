import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ds-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    [type]="type()"
    [disabled]="disabled() || loading()"
    [attr.aria-busy]="loading()"
    [class]="'ds-button ' + variant() + ' ' + size()"
    [class.w-full]="fullWidth()"
  >
    <span [class.opacity-50]="loading()"><ng-content /></span>
    @if (loading()) {
      <span class="ms-2" aria-hidden="true">…</span>
    }
  </button>`,
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
