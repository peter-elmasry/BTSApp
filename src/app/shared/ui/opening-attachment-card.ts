import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { openingAttachmentUrl, type OpeningAttachment } from '../media/opening-attachment';

@Component({
  selector: 'app-opening-attachment-card',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      @if (url(); as url) {
        <section class="ds-card mx-auto mb-5 max-w-3xl space-y-3" data-testid="opening-attachment">
          <h2 class="text-lg font-bold">{{ attachment()?.title || t('attachment.heading') }}</h2>
          @if (attachment()?.mime === 'image/webp') {
            @if (failedUrl() !== url) {
              <img
                class="max-h-[65vh] w-full rounded-xl object-contain"
                [src]="url"
                [alt]="attachment()?.title || t('attachment.heading')"
                (error)="imageFailed($event)"
              />
            } @else {
              <p role="status">{{ t('attachment.unavailable') }}</p>
            }
          } @else {
            <iframe
              class="h-80 w-full rounded-xl border border-mist"
              [src]="pdfUrl()"
              [title]="attachment()?.title || t('attachment.heading')"
              sandbox=""
            ></iframe>
            <p class="text-sm text-slate">{{ t('attachment.pdfHelp') }}</p>
          }
          <a class="ds-button secondary" [href]="url" target="_blank" rel="noopener noreferrer">{{
            t('attachment.open')
          }}</a>
        </section>
      }
    </ng-container>
  `,
})
export class OpeningAttachmentCard {
  readonly attachment = input<OpeningAttachment | null | undefined>(null);
  readonly url = computed(() => openingAttachmentUrl(this.attachment()));
  private readonly sanitizer = inject(DomSanitizer);
  readonly failedUrl = signal('');
  readonly pdfUrl = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.url()));
  imageFailed(event: Event) {
    const source = (event.target as HTMLImageElement).getAttribute('src') || '';
    if (source === this.url()) this.failedUrl.set(source);
  }
}
