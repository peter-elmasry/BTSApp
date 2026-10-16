import { ToastService } from '../../shared/ui/toast';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { normalizeTeamPalette, type TeamColour } from '../../shared/team-palette';

@Component({
  selector: 'app-team-palette-editor',
  imports: [FormsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t" class="ds-card space-y-3" data-testid="palette-editor">
      <h2 class="text-lg font-bold">{{ t('palette.heading') }}</h2>
      <p class="text-sm text-slate">{{ t('palette.help') }}</p>
      <fieldset class="min-w-0 space-y-3" [disabled]="saving()">
        @for (entry of entries(); track $index; let index = $index) {
          <div class="flex flex-wrap items-end gap-2 rounded-xl border border-mist p-3">
            <label class="min-w-0 flex-1 space-y-1"
              ><span>{{ t('palette.name') }}</span>
              <input
                class="ds-control w-full"
                maxlength="40"
                [ngModel]="entry.name"
                (ngModelChange)="change(index, 'name', $event)"
              />
            </label>
            <label class="space-y-1"
              ><span>{{ t('setup.hexColor') }}</span>
              <input
                class="ds-control w-28"
                maxlength="7"
                dir="ltr"
                [ngModel]="entry.hex"
                (ngModelChange)="change(index, 'hex', $event)"
              />
            </label>
            <span
              class="h-11 w-11 rounded-full border border-navy"
              [style.backgroundColor]="validHex(entry.hex) ? entry.hex : '#FFFFFF'"
              aria-hidden="true"
            ></span>
            <button
              type="button"
              class="ds-button ghost"
              (click)="remove(index)"
              [attr.aria-label]="t('palette.remove') + ': ' + entry.name"
            >
              {{ t('palette.remove') }}
            </button>
          </div>
        }
        <div class="ds-actions">
          <button
            type="button"
            class="ds-button secondary"
            [disabled]="entries().length >= 32"
            (click)="add()"
          >
            {{ t('palette.add') }}
          </button>
          <button type="button" class="ds-button primary" (click)="save()">
            {{ t('common.save') }}
          </button>
        </div>
      </fieldset>
      @if (notice()) {
        <p role="status">{{ t(notice()) }}</p>
      }
    </section>
  `,
})
export class TeamPaletteEditor {
  private readonly toast = inject(ToastService);
  readonly eventId = input.required<string>();
  readonly palette = input<unknown>([]);
  readonly saved = output<void>();
  readonly entries = signal<TeamColour[]>([]);
  readonly saving = signal(false);
  readonly notice = signal('');
  private readonly queue = inject(OpQueueService);
  constructor() {
    effect(() => this.entries.set(normalizeTeamPalette(this.palette()) ?? []));
  }
  validHex(value: string) {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
  }
  change(index: number, key: keyof TeamColour, value: string) {
    this.entries.update((entries) =>
      entries.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)),
    );
  }
  add() {
    if (this.entries().length < 32)
      this.entries.update((entries) => [...entries, { name: '', hex: '#087F8C' }]);
  }
  remove(index: number) {
    this.entries.update((entries) => entries.filter((_, i) => i !== index));
  }
  async save() {
    if (this.saving()) return;
    const palette = normalizeTeamPalette(this.entries());
    if (!palette) {
      this.notice.set('palette.invalid');
      return;
    }
    this.saving.set(true);
    try {
      const receipt = await this.queue.execute('set_team_palette', {
        p_event: this.eventId(),
        p_palette: palette,
      });
      this.entries.set(palette);
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'manage.saved');
      this.toast.show(this.notice());
      this.saved.emit();
    } catch {
      this.notice.set('errors.SAVE_FAILED');
    } finally {
      this.saving.set(false);
    }
  }
}
