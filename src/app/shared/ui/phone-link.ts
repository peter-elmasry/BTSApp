import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** `tel:` target with spaces, dashes and brackets removed; null when there is no number. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/[\s\-().]/g, '') ?? '';
  return /^\+?\d{6,15}$/.test(digits) ? `tel:${digits}` : null;
}

/** One-tap call link: 📞 + name + number (D043). Without a valid number only the name shows. */
@Component({
  selector: 'ds-phone-link',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (href(); as target) {
      <a
        *transloco="let t"
        class="ds-phone"
        [href]="target"
        [attr.aria-label]="t('ui.call', { name: name() })"
        (click)="$event.stopPropagation()"
        ><span aria-hidden="true">📞</span><span class="min-w-0 break-words">{{ name() }}</span>
        @if (showNumber()) {
          <span class="ds-phone-number tabular" dir="ltr">{{ phone() }}</span>
        }
      </a>
    } @else {
      <span class="ds-phone-none min-w-0 break-words">{{ name() }}</span>
    }`,
})
export class DsPhoneLink {
  readonly name = input.required<string>();
  readonly phone = input<string | null | undefined>(null);
  readonly showNumber = input(true);
  readonly href = computed(() => telHref(this.phone()));
}
