import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { LiveAdjustment, LiveSnapshot } from '../../core/live/live-types';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { localizedName } from '../public/public-helpers';
import { canEditLiveMatch, isLiveAdmin, liveErrorKey, remainingAllowance } from './live-helpers';

@Component({
  selector: 'app-adjustments-panel',
  imports: [TranslocoDirective, ReactiveFormsModule, DsBottomSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustments-panel.html',
})
export class AdjustmentsPanel {
  readonly snapshot = input.required<LiveSnapshot>();
  readonly matchId = input<string | null>(null);
  readonly disabled = input(false);
  readonly changed = output<void>();
  private readonly api = inject(LiveApi);
  private readonly auth = inject(AuthStore);
  readonly direction = inject(DirectionService);
  readonly name = localizedName;
  readonly form = new FormGroup({
    team: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    points: new FormControl(1, { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
    }),
  });
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly revokeReason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(500)],
  });
  readonly revokeTarget = signal<LiveAdjustment | null>(null);
  readonly saving = signal(false);
  readonly notice = signal('');
  readonly scope = computed(() => (this.matchId() ? ('MATCH' as const) : ('EVENT' as const)));
  readonly match = computed(() =>
    this.snapshot().matches.find((match) => match.id === this.matchId()),
  );
  readonly teams = computed(() =>
    this.matchId()
      ? this.snapshot().teams.filter((team) =>
          this.match()?.participants.some((participant) => participant.team_id === team.id),
        )
      : this.snapshot().teams,
  );
  readonly canAdd = computed(
    () =>
      !this.disabled() &&
      (this.matchId()
        ? canEditLiveMatch(this.snapshot(), this.match(), this.auth.profile())
        : isLiveAdmin(this.auth.profile(), this.snapshot().event.id)),
  );
  readonly adjustments = computed(() =>
    this.snapshot().adjustments.filter(
      (item) =>
        item.scope === this.scope() &&
        (this.scope() === 'EVENT' || item.match_id === this.matchId()),
    ),
  );
  readonly allowance = computed(() => {
    const value = this.values();
    const positive = (value.points ?? 0) > 0;
    const event = this.snapshot().event;
    const cap =
      this.scope() === 'MATCH'
        ? positive
          ? event.match_bonus_cap
          : event.match_penalty_cap
        : positive
          ? event.event_bonus_cap
          : event.event_penalty_cap;
    return remainingAllowance(
      cap,
      this.snapshot().adjustments,
      value.team ?? '',
      this.scope(),
      this.matchId(),
      positive,
    );
  });
  constructor() {
    effect(() => {
      const teams = this.teams();
      if (!teams.some((team) => team.id === this.form.controls.team.value))
        this.form.controls.team.setValue(teams[0]?.id ?? '');
    });
  }
  step(delta: number) {
    this.form.controls.points.setValue(this.form.controls.points.value + delta);
  }
  async add() {
    const value = this.form.getRawValue();
    if (!this.canAdd() || this.saving()) return;
    if (
      this.form.invalid ||
      !Number.isInteger(value.points) ||
      value.points === 0 ||
      value.reason.trim().length < 3
    ) {
      this.form.markAllAsTouched();
      this.notice.set('live.adjustmentInvalid');
      return;
    }
    if (this.allowance() !== null && Math.abs(value.points) > this.allowance()!) {
      this.notice.set('live.capReached');
      return;
    }
    this.saving.set(true);
    try {
      const receipt = await this.api.mutate('add_adjustment', {
        p_event: this.snapshot().event.id,
        p_scope: this.scope(),
        p_match: this.matchId(),
        p_team: value.team,
        p_points: value.points,
        p_reason: value.reason.trim(),
      });
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.saved');
      this.form.controls.reason.reset('');
      if (receipt.status === 'sent') this.changed.emit();
    } catch (error) {
      this.notice.set(liveErrorKey(error));
    } finally {
      this.saving.set(false);
    }
  }
  canRevoke(item: LiveAdjustment) {
    if (this.disabled() || item.revoked_at) return false;
    if (isLiveAdmin(this.auth.profile(), this.snapshot().event.id)) return true;
    return (
      item.given_by.id === this.auth.profile()?.id &&
      item.scope === 'MATCH' &&
      canEditLiveMatch(this.snapshot(), this.match(), this.auth.profile())
    );
  }
  openRevoke(item: LiveAdjustment) {
    this.revokeReason.reset('');
    this.revokeTarget.set(item);
  }
  async revoke() {
    const item = this.revokeTarget();
    if (!item || !this.canRevoke(item) || this.saving()) return;
    if (this.revokeReason.invalid || this.revokeReason.value.trim().length < 3) {
      this.revokeReason.markAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const receipt = await this.api.mutate('revoke_adjustment', {
        p_adjustment: item.id,
        p_reason: this.revokeReason.value.trim(),
      });
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'live.saved');
      this.revokeTarget.set(null);
      if (receipt.status === 'sent') this.changed.emit();
    } catch (error) {
      this.notice.set(liveErrorKey(error));
    } finally {
      this.saving.set(false);
    }
  }
  date(value: string) {
    return new Date(value).toLocaleString(
      this.direction.language() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
      { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' },
    );
  }
  teamName(id: string) {
    return this.name(
      this.snapshot().teams.find((team) => team.id === id),
      this.direction.language(),
    );
  }
}
