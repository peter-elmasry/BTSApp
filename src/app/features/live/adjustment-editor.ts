import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { LiveAdjustment } from '../../core/live/live-types';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { localizedName } from '../public/public-helpers';
import { canManageAdjustment, liveErrorKey, validAdjustmentAmount } from './live-helpers';

@Component({
  selector: 'app-adjustment-editor',
  imports: [ReactiveFormsModule, TranslocoDirective, DsBottomSheet],
  templateUrl: './adjustment-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjustmentEditor {
  readonly item = input.required<LiveAdjustment>();
  readonly eventId = input.required<string>();
  readonly disabled = input(false);
  readonly changed = output<void>();
  private readonly auth = inject(AuthStore);
  private readonly api = inject(LiveApi);
  private readonly queue = inject(OpQueueService);
  readonly direction = inject(DirectionService);
  readonly name = localizedName;
  readonly target = signal<{ id: string; points: number; revision: number } | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly amount = new FormControl(1, { nonNullable: true, validators: [Validators.required] });
  readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });
  readonly allowed = computed(
    () => !this.disabled() && canManageAdjustment(this.auth.profile(), this.eventId(), this.item()),
  );
  readonly pending = computed(() =>
    this.queue
      .operations()
      .some((op) => op.name === 'edit_adjustment' && op.args['p_adjustment'] === this.item().id),
  );
  open() {
    if (!this.allowed() || this.pending() || this.saving()) return;
    const item = this.item();
    this.amount.setValue(item.points);
    this.reason.reset('');
    this.notice.set('');
    this.target.set({ id: item.id, points: item.points, revision: item.revision ?? 0 });
  }
  async save() {
    const target = this.target();
    if (!target || !this.allowed() || this.saving() || this.pending()) return;
    if (
      !validAdjustmentAmount(this.amount.value) ||
      this.reason.invalid ||
      this.reason.value.trim().length < 3
    ) {
      this.notice.set('live.adjustmentInvalid');
      return;
    }
    if (target.points === this.amount.value) {
      this.notice.set('adjustEdit.unchanged');
      return;
    }
    this.saving.set(true);
    try {
      const receipt = await this.api.mutate('edit_adjustment', {
        p_adjustment: target.id,
        p_points: this.amount.value,
        p_reason: this.reason.value.trim(),
        p_expected_revision: target.revision,
      });
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.saved');
      this.target.set(null);
      if (receipt.status === 'sent') this.changed.emit();
    } catch (error) {
      this.notice.set(liveErrorKey(error));
    } finally {
      this.saving.set(false);
    }
  }
  time(value: string) {
    return new Date(value).toLocaleString(
      this.direction.language() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
      { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' },
    );
  }
}
