import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { ServerClockService } from '../../core/time/server-clock.service';
import { matchesSearch } from '../../shared/ui/data-table';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { DsInput } from '../../shared/ui/controls';
import { DsSearchSelect } from '../../shared/ui/search-select';
import { ToastService } from '../../shared/ui/toast';
import { AppointmentApi, appointmentError } from './appointment-api';
import { appointmentInstant, appointmentLocal, previewAppointmentSlots } from './appointment-model';
import type {
  AppointmentAction,
  AppointmentBooking,
  AppointmentDetail,
  AppointmentOptions,
  AppointmentResult,
  AppointmentSlot,
} from './appointment-types';

interface Review {
  action: AppointmentAction;
  payload: Record<string, unknown>;
  slot?: AppointmentSlot;
  preview?: { starts_at: string; ends_at: string }[];
}
@Component({
  selector: 'app-appointment-session-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    ReactiveFormsModule,
    DsInput,
    DsSearchSelect,
    DsBottomSheet,
  ],
  templateUrl: './appointment-session-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentSessionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly api = inject(AppointmentApi);
  readonly auth = inject(AuthStore);
  private readonly direction = inject(DirectionService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ServerClockService);
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  readonly managing = this.route.snapshot.data['appointmentMode'] === 'manage';
  readonly id = signal(this.route.snapshot.paramMap.get('id') ?? 'new');
  readonly detail = signal<AppointmentDetail | null>(null);
  readonly options = signal<AppointmentOptions>({ members: [], events: [] });
  readonly error = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly day = signal('');
  readonly interviewerFilter = signal('');
  readonly review = signal<Review | null>(null);
  readonly editingSlot = signal<AppointmentSlot | null>(null);
  readonly movingBooking = signal<AppointmentBooking | null>(null);
  readonly formVersion = signal<number | undefined>(undefined);
  readonly name = new FormControl(
    this.auth.profile()?.full_name_ar || this.auth.profile()?.full_name_en || '',
    { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] },
  );
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    location: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    meeting_url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000), Validators.pattern(/^$|^https:\/\/\S+$/)],
    }),
    timezone: new FormControl('Africa/Cairo', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    event_id: new FormControl('', { nonNullable: true }),
    status: new FormControl('DRAFT', { nonNullable: true }),
    opens_at: new FormControl(appointmentLocal(new Date().toISOString(), 'Africa/Cairo'), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    closes_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    cutoff_minutes: new FormControl(60, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(10080)],
    }),
  });
  readonly slotForm = new FormGroup({
    interviewer_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    duration_minutes: new FormControl(20, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(5), Validators.max(240)],
    }),
    gap_minutes: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(120)],
    }),
  });
  readonly myBooking = computed(
    () =>
      this.detail()
        ?.slots.map((s) => s.booking)
        .find((b) => b?.member_id === this.auth.profile()?.id) ?? null,
  );
  readonly memberOptions = computed(() =>
    this.options().members.map((m) => ({ value: m.id, label: m.name })),
  );
  readonly eventOptions = computed(() =>
    this.options().events.map((e) => ({ value: e.id, label: e.name })),
  );
  readonly interviewerOptions = computed(() => [
    ...new Map(
      this.detail()?.slots.map((s) => [
        s.interviewer_id,
        { value: s.interviewer_id, label: s.interviewer_name },
      ]) ?? [],
    ).values(),
  ]);
  readonly slots = computed(() =>
    (this.detail()?.slots ?? []).filter(
      (s) =>
        matchesSearch(`${s.interviewer_name} ${s.booking?.display_name ?? ''}`, this.query()) &&
        (!this.interviewerFilter() || s.interviewer_id === this.interviewerFilter()) &&
        (!this.day() ||
          appointmentLocal(s.starts_at, this.detail()!.session.timezone).startsWith(this.day())),
    ),
  );
  private generation = 0;
  readonly history = computed(() =>
    (this.detail()?.history ?? []).filter(
      (b) =>
        matchesSearch(b.display_name, this.query()) &&
        (!this.day() ||
          appointmentLocal(b.starts_at, this.detail()!.session.timezone).startsWith(this.day())),
    ),
  );
  private initializedId = '';
  constructor() {
    const subscription = this.route.paramMap.subscribe((params) => {
      this.id.set(params.get('id') ?? 'new');
      this.initializedId = '';
      this.detail.set(null);
      this.review.set(null);
      void this.refresh();
    });
    const refresh = () => {
      if (!this.document.hidden && navigator.onLine && !this.busy()) void this.refresh(false);
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('online', refresh);
    this.document.addEventListener('visibilitychange', refresh);
    this.destroy.onDestroy(() => {
      this.generation++;
      subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      this.document.removeEventListener('visibilitychange', refresh);
    });
  }
  async refresh(showLoading = true) {
    const generation = ++this.generation;
    if (showLoading) this.loading.set(true);
    try {
      const [detail, options] = await Promise.all([
        this.id() === 'new' ? Promise.resolve(null) : this.api.detail(this.id()),
        this.managing ? this.api.options() : Promise.resolve({ members: [], events: [] }),
      ]);
      if (generation !== this.generation) return;
      this.detail.set(detail);
      this.options.set(options);
      this.error.set('');
      if (detail && this.initializedId !== detail.session.id) {
        this.fillForm(detail);
        this.initializedId = detail.session.id;
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.error.set(appointmentError(error));
      this.detail.set(null);
      this.review.set(null);
      this.options.set({ members: [], events: [] });
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  private fillForm(detail: AppointmentDetail) {
    const s = detail.session;
    this.formVersion.set(s.version);
    this.form.reset({
      title: s.title,
      description: s.description,
      location: s.location,
      meeting_url: s.meeting_url,
      timezone: s.timezone,
      event_id: s.event_id ?? '',
      status: s.status,
      opens_at: appointmentLocal(s.opens_at, s.timezone),
      closes_at: appointmentLocal(s.closes_at, s.timezone),
      cutoff_minutes: s.cutoff_minutes,
    });
  }
  reloadForm() {
    const detail = this.detail();
    if (detail) this.fillForm(detail);
  }
  time(value: string) {
    return new Intl.DateTimeFormat(this.direction.language() === 'ar' ? 'ar-EG' : 'en-GB', {
      timeZone: this.detail()?.session.timezone ?? this.form.controls.timezone.value,
      dateStyle: 'medium',
      timeStyle: 'short',
      numberingSystem: 'latn',
    }).format(new Date(value));
  }
  bookingOpen() {
    const s = this.detail()?.session;
    return (
      !!s &&
      s.status === 'PUBLISHED' &&
      Date.parse(s.opens_at) <= this.clock.now() &&
      Date.parse(s.closes_at) > this.clock.now()
    );
  }
  canBook(slot: AppointmentSlot) {
    const booking = this.managing ? this.movingBooking() : this.myBooking();
    return (
      this.bookingOpen() &&
      slot.available &&
      slot.interviewer_id !== (booking?.member_id ?? this.auth.profile()?.id) &&
      (!this.managing || !!booking) &&
      (!booking || booking.status === 'BOOKED')
    );
  }
  reviewBooking(slot: AppointmentSlot) {
    const booking = this.managing ? this.movingBooking() : this.myBooking();
    if (!booking && (this.name.invalid || !this.name.value.trim())) {
      this.name.markAsTouched();
      this.error.set('INVALID_NAME');
      return;
    }
    this.review.set({
      action: booking ? 'RESCHEDULE' : 'BOOK',
      slot,
      payload: booking
        ? { booking_id: booking.id, version: booking.version, slot_id: slot.id }
        : { slot_id: slot.id, display_name: this.name.value.trim() },
    });
  }
  reviewCancel(booking: AppointmentBooking, slot: AppointmentSlot) {
    this.review.set({
      action: 'CANCEL',
      slot,
      payload: { booking_id: booking.id, version: booking.version },
    });
  }
  canAttend(slot: AppointmentSlot) {
    return slot.booking?.status === 'BOOKED' && Date.parse(slot.starts_at) <= this.clock.now();
  }
  reviewAttendance(slot: AppointmentSlot, status: 'COMPLETED' | 'NO_SHOW') {
    this.review.set({
      action: 'ATTEND',
      slot,
      payload: { booking_id: slot.booking!.id, version: slot.booking!.version, status },
    });
  }
  prepareSession() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('INVALID_APPOINTMENT');
      return;
    }
    try {
      const value = this.form.getRawValue();
      this.review.set({
        action: 'SAVE_SESSION',
        payload: {
          ...value,
          id: this.id() === 'new' ? null : this.id(),
          version: this.formVersion(),
          opens_at: appointmentInstant(value.opens_at, value.timezone),
          closes_at: appointmentInstant(value.closes_at, value.timezone),
        },
      });
    } catch (error) {
      this.error.set(appointmentError(error));
    }
  }
  prepareSlots(generate: boolean) {
    if (this.slotForm.invalid) {
      this.slotForm.markAllAsTouched();
      this.error.set('INVALID_APPOINTMENT');
      return;
    }
    try {
      const value = this.slotForm.getRawValue();
      const zone = this.detail()!.session.timezone;
      const starts_at = appointmentInstant(value.starts_at, zone),
        ends_at = appointmentInstant(value.ends_at, zone);
      const preview = generate
        ? previewAppointmentSlots(starts_at, ends_at, value.duration_minutes, value.gap_minutes)
        : [{ starts_at, ends_at }];
      if (Date.parse(starts_at) <= this.clock.now() || Date.parse(ends_at) <= Date.parse(starts_at))
        throw new Error('INVALID_APPOINTMENT');
      this.review.set({
        action: generate ? 'GENERATE_SLOTS' : 'SAVE_SLOT',
        preview,
        payload: {
          ...value,
          starts_at,
          ends_at,
          session_id: this.id(),
          id: this.editingSlot()?.id ?? null,
          version: this.editingSlot()?.version,
          blocked: false,
        },
      });
    } catch (error) {
      this.error.set(appointmentError(error));
    }
  }
  editSlot(slot: AppointmentSlot) {
    this.editingSlot.set(slot);
    this.slotForm.patchValue({
      interviewer_id: slot.interviewer_id,
      starts_at: appointmentLocal(slot.starts_at, this.detail()!.session.timezone),
      ends_at: appointmentLocal(slot.ends_at, this.detail()!.session.timezone),
    });
    this.document.getElementById('appointment-slot-editor')?.scrollIntoView({ behavior: 'smooth' });
  }
  blockSlot(slot: AppointmentSlot) {
    this.review.set({
      action: 'SAVE_SLOT',
      slot,
      payload: {
        id: slot.id,
        version: slot.version,
        session_id: this.id(),
        interviewer_id: slot.interviewer_id,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        blocked: !slot.blocked,
      },
    });
  }
  async commit() {
    const review = this.review();
    if (!review || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.write(review.action, review.payload);
      this.review.set(null);
      await this.afterSave(review.action, result);
    } catch (error) {
      this.error.set(appointmentError(error));
      this.review.set(null);
    } finally {
      this.busy.set(false);
    }
  }
  private async afterSave(action: AppointmentAction, result: AppointmentResult) {
    this.movingBooking.set(null);
    this.toast.show(
      action === 'BOOK' || action === 'RESCHEDULE'
        ? 'appointments.confirmed'
        : 'appointments.saved',
    );
    if (action === 'SAVE_SESSION' && this.id() === 'new') {
      await this.router.navigate(['/owner/appointments', result.id]);
      return;
    }
    if (action === 'SAVE_SESSION') this.initializedId = '';
    if (action === 'SAVE_SLOT' || action === 'GENERATE_SLOTS') {
      this.editingSlot.set(null);
      this.slotForm.reset({
        interviewer_id: '',
        starts_at: '',
        ends_at: '',
        duration_minutes: 20,
        gap_minutes: 0,
      });
    }
    await this.refresh(false);
  }
  async retry() {
    const action = this.api.pending()?.action;
    if (!action || this.busy()) return;
    this.busy.set(true);
    try {
      const result = await this.api.retry();
      await this.afterSave(action, result);
    } catch (error) {
      this.error.set(appointmentError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
