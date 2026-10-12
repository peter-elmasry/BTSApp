import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { map } from 'rxjs';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { localizedName } from '../public/public-helpers';
import { ManageContext } from './manage-context';
import { ManageNav } from './manage-nav';

/** Shell of every `/manage/:eventId/*` screen: section bar plus Import/Export (D045). */
@Component({
  selector: 'app-manage-layout',
  imports: [RouterOutlet, RouterLink, TranslocoDirective, ManageNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div *transloco="let t" class="space-y-4">
    <div class="ds-page-header">
      <p class="min-w-0 truncate text-sm font-semibold text-slate" data-testid="manage-event-label">
        {{ eventLabel() }}
      </p>
      <div class="ds-actions" role="group" [attr.aria-label]="t('manage.toolbar.label')">
        <a
          class="ds-button ghost sm inline-flex items-center gap-1"
          data-testid="toolbar-import"
          [routerLink]="['/manage', eventId(), 'import']"
          ><span aria-hidden="true">⬆</span>{{ t('manage.toolbar.import') }}</a
        >
        <a
          class="ds-button ghost sm inline-flex items-center gap-1"
          data-testid="toolbar-export"
          [routerLink]="['/manage', eventId(), 'standings']"
          [queryParams]="{ export: 1 }"
          ><span aria-hidden="true">⬇</span>{{ t('manage.toolbar.export') }}</a
        >
      </div>
    </div>
    <app-manage-nav [eventId]="eventId()" />
    <router-outlet />
  </div>`,
})
export class ManageLayout {
  private readonly route = inject(ActivatedRoute);
  private readonly events = inject(EventStore);
  private readonly direction = inject(DirectionService);
  private readonly context = inject(ManageContext);
  readonly eventId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('eventId') ?? '')),
    {
      initialValue: this.route.snapshot.paramMap.get('eventId') ?? '',
    },
  );
  readonly eventLabel = computed(() => {
    if (this.context.eventLabel()) return this.context.eventLabel();
    const event = this.events.event();
    if (!event || event.id !== this.eventId()) return '';
    return `${localizedName(event, this.direction.language())} · ${event.code}`;
  });
}
