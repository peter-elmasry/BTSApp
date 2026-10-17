import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { RoundPushService } from '../../core/pwa/round-push.service';

@Component({
  selector: 'app-round-push-controls',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details
      *transloco="let t"
      class="mt-2 rounded-xl border border-mist bg-white p-3"
      data-testid="round-push-controls"
    >
      <summary class="min-h-11 cursor-pointer py-2 font-bold">
        {{ t('push.heading') }}
        <span class="ms-2 text-sm font-normal text-slate">{{
          t(push.enabled() ? 'push.on' : 'push.off')
        }}</span>
      </summary>
      <div class="space-y-3 pt-2 text-sm">
        <p>{{ t('push.description') }}</p>
        @if (push.eventName()) {
          <p>{{ t('push.event') }}: {{ push.eventName() }}</p>
        }
        <p class="text-slate">{{ t('push.phoneHelp') }}</p>
        @if (!push.supported) {
          <p role="status">{{ t('push.unsupported') }}</p>
        } @else {
          @if (push.permission() === 'denied') {
            <p role="status">{{ t('push.denied') }}</p>
          }
          @if (push.error()) {
            <p role="alert" class="text-error">{{ t('push.' + push.error()) }}</p>
          }
          @if (push.notice()) {
            <p role="status">{{ t('push.' + push.notice()) }}</p>
          }
          <div class="flex flex-wrap gap-2">
            @if (!push.enabled()) {
              <button
                class="ds-button secondary sm"
                type="button"
                [disabled]="push.busy() || !push.ready() || push.permission() === 'denied'"
                (click)="push.enable()"
              >
                {{ t('push.enable') }}
              </button>
            } @else {
              <button
                class="ds-button secondary sm"
                type="button"
                [disabled]="push.busy()"
                (click)="push.test()"
              >
                {{ t('push.test') }}
              </button>
            }
            @if (push.hasDevice()) {
              <button
                class="ds-button ghost sm"
                type="button"
                [disabled]="push.busy()"
                (click)="push.disable()"
              >
                {{ t('push.disable') }}
              </button>
            }
            @if (!push.ready()) {
              <button
                class="ds-button ghost sm"
                type="button"
                [disabled]="push.busy()"
                (click)="push.initialize()"
              >
                {{ t('push.retry') }}
              </button>
            }
          </div>
        }
      </div>
    </details>
  `,
})
export class RoundPushControls {
  readonly push = inject(RoundPushService);
}
