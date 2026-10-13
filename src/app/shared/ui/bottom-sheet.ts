import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
@Component({
  selector: 'ds-bottom-sheet',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bottom-sheet.html',
})
export class DsBottomSheet implements OnDestroy {
  readonly title = input.required<string>();
  /** `full` = near full-height sheet for drill-downs. */
  readonly size = input<'auto' | 'full'>('auto');
  readonly close = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly document = inject(DOCUMENT);
  private previousFocus?: HTMLElement;
  private previousOverflow = '';
  private destroyed = false;
  private cancelEmitted = false;
  constructor() {
    afterNextRender(() => {
      this.previousFocus = this.document.activeElement as HTMLElement;
      this.previousOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      this.dialog().nativeElement.showModal();
    });
  }
  backdrop(event: MouseEvent) {
    if (event.target === this.dialog().nativeElement) {
      const rect = this.dialog().nativeElement.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientX < rect.x || event.clientX > rect.x + rect.width)
        this.close.emit();
    }
  }
  /**
   * The browser can close the dialog itself (Escape without a recent user gesture skips
   * `cancel`), so the owner must still hear about it or the sheet can never reopen.
   */
  closed() {
    if (!this.destroyed && !this.cancelEmitted) this.close.emit();
    this.cancelEmitted = false;
  }
  cancelled() {
    this.cancelEmitted = true;
    this.close.emit();
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.dialog().nativeElement.close();
    this.document.body.style.overflow = this.previousOverflow;
    this.previousFocus?.focus();
  }
}
