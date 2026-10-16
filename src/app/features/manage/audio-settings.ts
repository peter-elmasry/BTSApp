import { ToastService } from '../../shared/ui/toast';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { EventAudioService } from '../../core/audio/event-audio.service';
import {
  AUDIO_CUES,
  DEFAULT_AUDIO_CONFIG,
  type AudioConfig,
  type AudioCue,
} from '../../core/audio/audio-types';
@Component({
  selector: 'app-audio-settings',
  imports: [FormsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t" class="ds-card space-y-3" data-testid="audio-settings">
      <details data-testid="admin-audio-options">
        <summary class="min-h-11 cursor-pointer py-2 text-lg font-bold">
          {{ t('audio.settings') }}
          <span class="ms-2 text-sm font-normal">{{
            t(config().enabled ? 'audio.enabled' : 'audio.muted')
          }}</span>
        </summary>
        <p class="text-sm text-slate">{{ t('audio.settingsHelp') }}</p>
        <fieldset class="space-y-2" [disabled]="saving()">
          <label class="flex min-h-11 items-center gap-2"
            ><input
              type="checkbox"
              [ngModel]="config().enabled"
              (ngModelChange)="set('enabled', $event)"
            />{{ t('audio.master') }}</label
          >
          @for (cue of cues; track cue) {
            <div class="flex flex-wrap items-center justify-between gap-2">
              <label class="flex min-h-11 items-center gap-2"
                ><input
                  type="checkbox"
                  [ngModel]="config()[key(cue)]"
                  (ngModelChange)="set(key(cue), $event)"
                />{{ t('audio.cue.' + cue) }}</label
              >
              <button
                type="button"
                class="ds-button ghost sm"
                [disabled]="!audio.enabled() || !audio.leader() || audio.loading()"
                (click)="audio.preview(cue)"
                [attr.aria-label]="t('audio.preview') + ': ' + t('audio.cue.' + cue)"
              >
                {{ t('audio.preview') }}
              </button>
            </div>
          }
          <button type="button" class="ds-button primary" (click)="save()">
            {{ t('common.save') }}
          </button>
        </fieldset>
      </details>
      @if (dirty()) {
        <p role="status" class="text-sm">{{ t('audio.unsaved') }}</p>
      }
      @if (notice()) {
        <p role="status">{{ t(notice()) }}</p>
      }
    </section>
  `,
})
export class AudioSettings {
  private readonly toast = inject(ToastService);
  readonly eventId = input.required<string>();
  readonly initial = input<AudioConfig | undefined>();
  readonly saved = output<void>();
  readonly config = signal<AudioConfig>({ ...DEFAULT_AUDIO_CONFIG });
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly notice = signal('');
  readonly audio = inject(EventAudioService);
  private readonly queue = inject(OpQueueService);
  readonly cues = AUDIO_CUES;
  constructor() {
    effect(() => {
      const initial = this.initial();
      if (untracked(() => !this.dirty())) this.config.set({ ...DEFAULT_AUDIO_CONFIG, ...initial });
    });
  }
  key(cue: AudioCue) {
    return cue.replaceAll('-', '_') as Exclude<keyof AudioConfig, 'enabled'>;
  }
  set(key: keyof AudioConfig, value: boolean) {
    this.dirty.set(true);
    this.config.update((config) => ({ ...config, [key]: value }));
  }
  async save() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const receipt = await this.queue.execute('set_audio_config', {
        p_event: this.eventId(),
        p_config: this.config(),
      });
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'manage.saved');
      this.toast.show(this.notice());
      if (receipt.status === 'sent') this.dirty.set(false);
      this.saved.emit();
    } catch {
      this.notice.set('errors.SAVE_FAILED');
    } finally {
      this.saving.set(false);
    }
  }
}
