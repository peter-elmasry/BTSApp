import { ToastService } from '../../shared/ui/toast';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { supabase } from '../../core/supabase/client';
import {
  prepareOpeningAttachment,
  type OpeningAttachment,
} from '../../shared/media/opening-attachment';
import { OpeningAttachmentCard } from '../../shared/ui/opening-attachment-card';

export interface OpeningRoundAttachment {
  id: string;
  attachment_path?: string | null;
  attachment_mime?: 'image/webp' | 'application/pdf' | null;
  attachment_title?: string | null;
  attachment_visible?: boolean;
}
@Component({
  selector: 'app-opening-attachment-editor',
  imports: [FormsModule, TranslocoDirective, OpeningAttachmentCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t" class="ds-card space-y-3" data-testid="opening-editor">
      <h2 class="text-lg font-bold">{{ t('attachment.heading') }}</h2>
      <p class="text-sm text-slate">{{ t('attachment.publicHelp') }}</p>
      <fieldset class="space-y-3" [disabled]="saving()">
        <label class="block space-y-1"
          ><span>{{ t('attachment.file') }}</span>
          <input
            class="ds-control w-full"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            (change)="select($event)"
          />
        </label>
        <label class="block space-y-1"
          ><span>{{ t('attachment.title') }}</span>
          <input
            class="ds-control w-full"
            maxlength="160"
            [ngModel]="title()"
            (ngModelChange)="title.set($event)"
          />
        </label>
        <label class="flex min-h-11 items-center gap-2"
          ><input type="checkbox" [ngModel]="visible()" (ngModelChange)="visible.set($event)" />{{
            t('attachment.visible')
          }}</label
        >
        @if (processing()) {
          <p role="status">{{ t('manage.imageProcessing') }}</p>
        }
        @if (file(); as file) {
          <p class="break-words text-sm">{{ file.name }}</p>
        }
        @if (preview(); as preview) {
          @if (file()?.type === 'image/webp') {
            <img
              class="max-h-64 max-w-full object-contain"
              [src]="preview"
              [alt]="title() || t('attachment.heading')"
            />
          } @else {
            <a class="ds-button ghost" [href]="preview" target="_blank" rel="noopener noreferrer">{{
              t('attachment.open')
            }}</a>
          }
        } @else if (stored(); as attachment) {
          <app-opening-attachment-card [attachment]="attachment" />
        }
        <div class="ds-actions">
          <button
            type="button"
            class="ds-button primary"
            [disabled]="processing()"
            (click)="save()"
          >
            {{ t('common.save') }}
          </button>
          <button
            type="button"
            class="ds-button ghost"
            [disabled]="!stored() && !file()"
            (click)="remove()"
          >
            {{ t('attachment.remove') }}
          </button>
        </div>
      </fieldset>
      @if (notice()) {
        <p role="status">{{ t(notice()) }}</p>
      }
    </section>
  `,
})
export class OpeningAttachmentEditor {
  private readonly toast = inject(ToastService);
  readonly eventId = input.required<string>();
  readonly round = input.required<OpeningRoundAttachment>();
  readonly saved = output<void>();
  private readonly queue = inject(OpQueueService);
  readonly title = signal('');
  readonly visible = signal(false);
  readonly stored = signal<OpeningAttachment | null>(null);
  readonly file = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  readonly saving = signal(false);
  readonly processing = signal(false);
  readonly notice = signal('');
  private request = 0;
  private currentRound = '';
  constructor() {
    effect(() => {
      const round = this.round();
      if (round.id === this.currentRound) return;
      this.currentRound = round.id;
      this.request++;
      this.release();
      this.file.set(null);
      this.processing.set(false);
      this.title.set(round.attachment_title ?? '');
      this.visible.set(round.attachment_visible ?? false);
      this.stored.set(
        round.attachment_path && round.attachment_mime
          ? {
              path: round.attachment_path,
              mime: round.attachment_mime,
              title: round.attachment_title ?? null,
            }
          : null,
      );
    });
    inject(DestroyRef).onDestroy(() => {
      this.request++;
      this.release();
    });
  }
  private release() {
    const preview = this.preview();
    if (preview) URL.revokeObjectURL(preview);
    this.preview.set(null);
  }
  async select(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.saving()) return;
    const request = ++this.request;
    this.release();
    this.file.set(null);
    this.processing.set(true);
    this.notice.set('');
    try {
      const prepared = await prepareOpeningAttachment(file);
      if (request !== this.request) return;
      this.file.set(prepared);
      this.preview.set(URL.createObjectURL(prepared));
    } catch {
      if (request === this.request) this.notice.set('attachment.invalid');
    } finally {
      if (request === this.request) this.processing.set(false);
    }
  }
  async save() {
    if (this.saving() || this.processing()) return;
    if (this.title().length > 160) {
      this.notice.set('attachment.invalid');
      return;
    }
    const request = this.request;
    const round = this.round().id;
    const title = this.title().trim();
    const visible = this.visible();
    this.saving.set(true);
    this.notice.set('');
    try {
      let attachment = this.stored();
      const file = this.file();
      if (file) {
        const mime = file.type === 'application/pdf' ? 'application/pdf' : 'image/webp';
        const path = `${this.eventId()}/${round}/${crypto.randomUUID()}.${mime === 'application/pdf' ? 'pdf' : 'webp'}`;
        const { error } = await supabase.storage
          .from('opening-attachments')
          .upload(path, file, { contentType: mime, upsert: false });
        if (error) throw error;
        if (request !== this.request) return;
        attachment = { path, mime, title };
        this.stored.set(attachment);
        this.file.set(null);
        this.release();
      }
      if (request !== this.request) return;
      const receipt = await this.queue.execute('set_opening_attachment', {
        p_round: round,
        p_path: attachment?.path ?? null,
        p_mime: attachment?.mime ?? null,
        p_title: title,
        p_visible: visible,
      });
      if (request !== this.request) return;
      if (attachment) this.stored.set({ ...attachment, title });
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'manage.saved');
      this.toast.show(this.notice());
      this.saved.emit();
    } catch {
      if (request === this.request) this.notice.set('attachment.saveFailed');
    } finally {
      this.saving.set(false);
    }
  }
  remove() {
    if (this.saving()) return;
    this.request++;
    this.release();
    this.file.set(null);
    this.stored.set(null);
    this.processing.set(false);
    this.visible.set(false);
  }
}
