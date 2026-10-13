import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { map } from 'rxjs';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { localizedName } from '../public/public-helpers';
import { ExportSheet } from '../standings/export-sheet';
import { ManageContext } from './manage-context';
import { ManageNav } from './manage-nav';

/** Shell of every `/manage/:eventId/*` screen: section bar plus Import/Export (D045). */
@Component({
  selector: 'app-manage-layout',
  imports: [RouterOutlet, RouterLink, TranslocoDirective, ManageNav, ExportSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div *transloco="let t" class="space-y-4">
    <div class="ds-page-header">
      <p class="min-w-0 truncate text-sm font-semibold text-slate" data-testid="manage-event-label">
        {{ eventLabel() }}
      </p>
      <!-- Phones reach these from the bottom bar and More (product owner, 2026-10-13). -->
      <div class="hidden md:block">
        <div class="ds-actions" role="group" [attr.aria-label]="t('manage.toolbar.label')">
          <a
            class="ds-button ghost sm inline-flex items-center gap-1"
            data-testid="toolbar-import"
            [routerLink]="['/manage', eventId(), 'import']"
            ><span aria-hidden="true">⬆</span>{{ t('manage.toolbar.import') }}</a
          >
          <button
            type="button"
            class="ds-button ghost sm inline-flex items-center gap-1"
            data-testid="toolbar-export"
            (click)="exporting.set(true)"
          >
            <span aria-hidden="true">⬇</span>{{ t('manage.toolbar.export') }}
          </button>
        </div>
      </div>
    </div>
    <div class="hidden md:block"><app-manage-nav [eventId]="eventId()" /></div>
    <router-outlet />
    @if (exporting()) {
      @defer {
        <app-export-sheet [eventId]="eventId()" (close)="closeExport()" />
      }
    }
  </div>`,
})
export class ManageLayout {
  private readonly route = inject(ActivatedRoute);
  private readonly events = inject(EventStore);
  private readonly direction = inject(DirectionService);
  private readonly context = inject(ManageContext);
  private readonly router = inject(Router);
  readonly exporting = signal(false);
  private readonly query = toSignal(this.router.routerState.root.queryParamMap, {
    initialValue: this.router.routerState.snapshot.root.queryParamMap,
  });
  readonly eventId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('eventId') ?? '')),
    {
      initialValue: this.route.snapshot.paramMap.get('eventId') ?? '',
    },
  );
  constructor() {
    // "Export (Excel)" in the More menu links here with ?export=1 (D045).
    effect(() => {
      if (this.query().get('export') === '1') this.exporting.set(true);
    });
  }
  closeExport() {
    this.exporting.set(false);
    if (this.query().get('export') === '1')
      void this.router.navigate([], {
        queryParams: { export: null },
        queryParamsHandling: 'merge',
      });
  }
  readonly eventLabel = computed(() => {
    if (this.context.eventLabel()) return this.context.eventLabel();
    const event = this.events.event();
    if (!event || event.id !== this.eventId()) return '';
    return `${localizedName(event, this.direction.language())} · ${event.code}`;
  });
}
