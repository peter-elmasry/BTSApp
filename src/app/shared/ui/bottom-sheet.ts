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
  template: `<dialog
    #dialog
    class="ds-sheet rounded-t-card border-0 bg-ivory p-5 text-navy"
    [attr.aria-label]="title()"
    (cancel)="close.emit()"
    (click)="backdrop($event)"
  >
    <div class="mb-4 flex items-center justify-between gap-4">
      <h2 class="text-xl font-bold">{{ title() }}</h2>
      <button
        autofocus
        class="min-h-11 min-w-11 rounded-lg"
        [attr.aria-label]="'common.close' | transloco"
        (click)="close.emit()"
      >
        ×
      </button>
    </div>
    <ng-content />
  </dialog>`,
})
export class DsBottomSheet implements OnDestroy {
  readonly title = input.required<string>();
  readonly close = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly document = inject(DOCUMENT);
  private previousFocus?: HTMLElement;
  private previousOverflow = '';
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
  ngOnDestroy() {
    this.dialog().nativeElement.close();
    this.document.body.style.overflow = this.previousOverflow;
    this.previousFocus?.focus();
  }
}
