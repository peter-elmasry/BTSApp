import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { StandingsApi } from '../../core/standings/standings-api';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { cairoExportTime } from './export-workbook';
import { ExportWorkbookService } from './export-workbook-service';

/**
 * One-tap Excel export (D045): fetches one fresh snapshot and downloads exactly that
 * snapshot. "Preview first" keeps the frozen-preview flow on the Standings screen.
 */
@Component({
  selector: 'app-export-sheet',
  imports: [RouterLink, TranslocoDirective, DsBottomSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ds-bottom-sheet *transloco="let t" [title]="t('export.title')" (close)="close.emit()">
    <div class="space-y-4" data-testid="export-sheet">
      <p>{{ t('export.includes') }}</p>
      <ul class="grid gap-1 font-semibold">
        <li>📊 {{ t('phase6.standings') }}</li>
        <li>🏁 {{ t('export.matches') }}</li>
        <li>± {{ t('export.adjustments') }}</li>
        <li>👥 {{ t('export.staff') }}</li>
      </ul>
      <p class="text-sm text-slate">{{ t('export.noPhones') }}</p>
      @if (generatedAt(); as at) {
        <p class="text-sm text-slate" role="status">
          {{ t('export.generatedAt') }} <span dir="ltr">{{ at }}</span> · Africa/Cairo
        </p>
      }
      @if (error()) {
        <p role="alert" class="text-error">{{ t(error()) }}</p>
      }
      <button
        class="ds-button primary w-full"
        data-testid="export-download"
        [disabled]="busy()"
        (click)="download()"
      >
        ⬇ {{ t(busy() ? 'phase6.preparing' : 'export.download') }}
      </button>
      <a
        class="ds-button ghost flex w-full items-center justify-center"
        [routerLink]="['/manage', eventId(), 'standings']"
        [queryParams]="{ preview: 1 }"
        (click)="close.emit()"
        >{{ t('export.previewFirst') }}</a
      >
    </div>
  </ds-bottom-sheet>`,
})
export class ExportSheet {
  readonly eventId = input.required<string>();
  readonly close = output<void>();
  private readonly api = inject(StandingsApi);
  private readonly workbook = inject(ExportWorkbookService);
  private readonly translation = inject(TranslocoService);
  private readonly direction = inject(DirectionService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly generatedAt = signal('');

  async download() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const snapshot = await this.api.export(this.eventId());
      this.generatedAt.set(cairoExportTime(snapshot.generated_at));
      const language = this.direction.language();
      const file = await this.workbook.prepare(snapshot, language, (key) =>
        this.translation.translate(key, {}, language),
      );
      this.workbook.download(file);
      this.close.emit();
    } catch {
      this.error.set('export.failed');
    } finally {
      this.busy.set(false);
    }
  }
}
