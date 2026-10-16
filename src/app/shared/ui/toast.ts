import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly document = inject(DOCUMENT);
  readonly target = signal<HTMLDialogElement | null>(null);
  /** Translation key shown in the toast. */
  readonly message = signal('');
  readonly params = signal<Record<string, unknown> | undefined>(undefined);
  private timer?: ReturnType<typeof setTimeout>;
  show(message: string, params?: Record<string, unknown>) {
    clearTimeout(this.timer);
    this.retarget();
    this.params.set(params);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(''), 5000);
  }
  dismiss() {
    clearTimeout(this.timer);
    this.message.set('');
  }
  /** Native modal dialogs cover and make page-level notifications inert. */
  retarget() {
    const dialogs = this.document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    this.target.set(dialogs.length ? dialogs[dialogs.length - 1] : null);
  }
}
@Component({
  selector: 'ds-toast',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast.html',
})
export class DsToast {
  readonly dialog = input<HTMLDialogElement | null>(null);
  readonly toast = inject(ToastService);
}
