import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Translation key shown in the toast. */
  readonly message = signal('');
  readonly params = signal<Record<string, unknown> | undefined>(undefined);
  private timer?: ReturnType<typeof setTimeout>;
  show(message: string, params?: Record<string, unknown>) {
    clearTimeout(this.timer);
    this.params.set(params);
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
  templateUrl: './toast.html',
})
export class DsToast {
  readonly toast = inject(ToastService);
}
