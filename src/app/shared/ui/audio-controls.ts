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
      <div
        class="flex items-start gap-2 rounded-xl border border-mist bg-white p-3"
        [attr.data-testid]="audio.prompt() ? 'audio-consent' : null"
      >
        <details class="min-w-0 flex-1" [open]="audio.prompt()" data-testid="audio-options">
          <summary class="min-h-11 cursor-pointer py-2 font-bold">
            {{ t('audio.heading') }}
            <span role="status" class="ms-2 text-sm font-normal text-slate">
              @if (!audio.config().enabled) {
                {{ t('audio.organizerMuted') }}
              } @else if (audio.loading()) {
                {{ t('audio.preparing') }}
              } @else if (audio.failed()) {
                {{ t('audio.unavailable') }}
              } @else if (
                audio.needsGesture() || (!audio.enabled() && audio.decision() === 'enabled')
              ) {
                {{ t('audio.resume') }}
              } @else if (audio.enabled() && !audio.leader()) {
                {{ t('audio.otherTab') }}
              } @else if (audio.enabled()) {
                {{ t('audio.enabled') }}
              } @else {
                {{ t('audio.muted') }}
              }
            </span>
          </summary>
          <div class="space-y-3 pt-2">
            @if (audio.prompt()) {
              <p class="text-sm">{{ t('audio.permissionHelp') }}</p>
            }
            <label class="flex min-h-11 flex-wrap items-center gap-2 text-sm">
              {{ t('audio.volume') }}
              <input
                class="max-w-full"
                type="range"
                min="0"
                max="100"
                step="1"
                [value]="audio.volume()"
                (input)="audio.setVolume(+$any($event.target).value)"
              />
            </label>
            <button
              type="button"
              class="ds-button secondary sm"
              [disabled]="audio.loading()"
              (click)="audio.testSound()"
            >
              {{ t('audio.test') }}
            </button>
          </div>
        </details>
        <div class="flex shrink-0 flex-col gap-2">
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
          @if (audio.prompt()) {
            <button type="button" class="ds-button ghost sm" (click)="audio.mute()">
              {{ t('audio.keepMuted') }}
            </button>
          }
        </div>
      </div>
      @if (audio.missing().length) {
        <p role="status" class="text-sm text-error">{{ t('audio.missing') }}</p>
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
