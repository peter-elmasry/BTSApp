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
  templateUrl: './toast.html',
})
export class DsToast {
  readonly toast = inject(ToastService);
}
