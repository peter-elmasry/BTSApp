import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

export type DsStatus = 'scheduled' | 'live' | 'pending' | 'late' | 'done' | 'void' | 'queued';

export const STATUS_ICONS: Record<DsStatus, string> = {
  scheduled: '◷',
  live: '●',
  pending: '…',
  late: '⏰',
  done: '✓',
  void: '⊘',
  queued: '⇡',
};

/** One status vocabulary everywhere: icon + word + token colour; pops when it changes. */
@Component({
  selector: 'ds-status-pill',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-container *transloco="let t">
    @for (current of statusList(); track current) {
      <span class="ds-pill" animate.enter="ds-pop" [attr.data-status]="current"
        ><span aria-hidden="true">{{ icon(current) }}</span
        >{{ t('ui.status.' + current) }}</span
      >
    }
  </ng-container>`,
})
export class DsStatusPill {
  readonly status = input.required<DsStatus>();
  readonly statusList = computed(() => [this.status()]);
  icon(status: DsStatus) {
    return STATUS_ICONS[status];
  }
}
