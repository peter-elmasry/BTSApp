import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventAudioService } from '../../core/audio/event-audio.service';

@Component({
  selector: 'app-audio-controls',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      *transloco="let t"
      class="mx-auto max-w-3xl px-4 pt-3"
      [attr.aria-label]="t('audio.heading')"
      data-testid="audio-controls"
    >
      @if (audio.config().enabled) {
        @if (audio.prompt()) {
          <div class="ds-card space-y-3" data-testid="audio-consent">
            <h2 class="font-bold">{{ t('audio.permission') }}</h2>
            <p class="text-sm">{{ t('audio.permissionHelp') }}</p>
            <div class="ds-actions">
              <button type="button" class="ds-button primary" (click)="audio.enable()">
                {{ t('audio.enable') }}</button
              ><button type="button" class="ds-button ghost" (click)="audio.mute()">
                {{ t('audio.keepMuted') }}
              </button>
            </div>
          </div>
        } @else {
          <div class="flex flex-wrap items-center gap-3 rounded-xl border border-mist bg-white p-3">
            @if (!audio.enabled() || audio.needsGesture()) {
              <button
                type="button"
                class="ds-button secondary sm"
                [disabled]="audio.loading()"
                (click)="audio.enable()"
              >
                {{ t('audio.enable') }}
              </button>
            } @else {
              <button type="button" class="ds-button ghost sm" (click)="audio.mute()">
                {{ t('audio.mute') }}
              </button>
            }
            <label class="flex min-h-11 items-center gap-2 text-sm"
              >{{ t('audio.volume') }}
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                [value]="audio.volume()"
                (input)="audio.setVolume(+$any($event.target).value)"
              />
            </label>
            <span role="status" class="text-sm text-slate">
              @if (audio.loading()) {
                {{ t('audio.preparing') }}
              } @else if (audio.failed()) {
                {{ t('audio.unavailable') }}
              } @else if (audio.needsGesture()) {
                {{ t('audio.resume') }}
              } @else if (audio.enabled() && !audio.leader()) {
                {{ t('audio.otherTab') }}
              } @else if (audio.enabled()) {
                {{ t('audio.enabled') }}
              } @else {
                {{ t('audio.muted') }}
              }
            </span>
            @if (audio.missing().length) {
              <span role="status" class="text-sm text-error">{{ t('audio.missing') }}</span>
            }
          </div>
        }
      } @else {
        <p class="text-sm text-slate">{{ t('audio.organizerMuted') }}</p>
      }
    </section>
  `,
})
export class AudioControls {
  readonly audio = inject(EventAudioService);
  readonly roundOnly = input(false);
  constructor() {
    effect(() => this.audio.roundOnly.set(this.roundOnly()));
    inject(DestroyRef).onDestroy(() => this.audio.roundOnly.set(false));
  }
}
