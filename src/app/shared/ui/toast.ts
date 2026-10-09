import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal('');
  private timer?: ReturnType<typeof setTimeout>;
  show(message: string) {
    clearTimeout(this.timer);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(''), 5000);
  }
  dismiss() {
    clearTimeout(this.timer);
    this.message.set('');
  }
}
@Component({
  selector: 'ds-toast',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    aria-live="polite"
    aria-atomic="true"
    class="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md"
  >
    @if (toast.message()) {
      <div
        animate.enter="enter"
        class="flex items-center gap-3 rounded-card bg-navy p-4 text-white shadow-card"
      >
        <p class="flex-1">{{ toast.message() }}</p>
        <button
          class="min-h-11 min-w-11 rounded-lg"
          [attr.aria-label]="'common.dismiss' | transloco"
          (click)="toast.dismiss()"
        >
          ×
        </button>
      </div>
    }
  </div>`,
})
export class DsToast {
  readonly toast = inject(ToastService);
}
