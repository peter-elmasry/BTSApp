import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventReportApi, EventHistory } from '../../core/events/event-report-api';
import { DirectionService } from '../../core/i18n/i18n.service';
import { localizedName } from '../public/public-helpers';

@Component({
  selector: 'app-history-page',
  imports: [RouterLink, TranslocoDirective],
  templateUrl: './history-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
  private readonly api = inject(EventReportApi);
  readonly direction = inject(DirectionService);
  readonly data = signal<EventHistory | null>(null);
  readonly error = signal(false);
  readonly loading = signal(false);
  readonly name = localizedName;
  private generation = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.data.set(null);
    });
    void this.load();
  }
  async load() {
    const generation = ++this.generation;
    this.data.set(null);
    this.error.set(false);
    this.loading.set(true);
    try {
      const data = await this.api.history();
      if (generation === this.generation) this.data.set(data);
    } catch {
      if (generation === this.generation) this.error.set(true);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
