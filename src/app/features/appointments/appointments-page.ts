import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { ServerClockService } from '../../core/time/server-clock.service';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { ToastService } from '../../shared/ui/toast';
import { matchesSearch } from '../../shared/ui/data-table';
import { AppointmentApi, appointmentError } from './appointment-api';
import type { AppointmentEntry, AppointmentSession } from './appointment-types';

@Component({
  selector: 'app-appointments-page',
  imports: [RouterLink, TranslocoDirective, DsBottomSheet],
  templateUrl: './appointments-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentsPage {
  readonly mode = inject(ActivatedRoute).snapshot.data['appointmentMode'] as
    'list' | 'mine' | 'interviews' | 'manage';
  readonly api = inject(AppointmentApi);
  readonly auth = inject(AuthStore);
  private readonly direction = inject(DirectionService);
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ServerClockService);
  readonly sessions = signal<AppointmentSession[]>([]);
  readonly entries = signal<AppointmentEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly query = signal('');
  readonly status = signal('');
  readonly day = signal('');
  readonly confirm = signal<AppointmentEntry | null>(null);
  readonly filteredSessions = computed(() =>
    this.sessions().filter((s) =>
      matchesSearch(`${s.title} ${s.description} ${s.location}`, this.query()),
    ),
  );
  readonly filteredEntries = computed(() =>
    this.entries().filter(
      (b) =>
        matchesSearch(
          `${b.title} ${b.display_name} ${b.interviewer_name} ${b.location}`,
          this.query(),
        ) &&
        (!this.status() || b.status === this.status()) &&
        (!this.day() || this.dateKey(b.starts_at, b.timezone) === this.day()),
    ),
  );
  readonly bookedCount = computed(() => this.entries().filter((b) => b.status === 'BOOKED').length);
  readonly next = computed(() =>
    this.entries().find((b) => b.status === 'BOOKED' && Date.parse(b.ends_at) > this.clock.now()),
  );
  private generation = 0;
  constructor() {
    void this.refresh();
    const refresh = () => {
      if (!this.document.hidden && navigator.onLine && !this.busy()) void this.refresh(false);
    };
    const timer = setInterval(refresh, 15000);
    this.document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    this.destroy.onDestroy(() => {
      this.generation++;
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    });
  }
  async refresh(showLoading = true) {
    const generation = ++this.generation;
    if (showLoading) this.loading.set(true);
    try {
      if (this.mode === 'list' || this.mode === 'manage') {
        const sessions = await this.api.list();
        if (generation === this.generation) this.sessions.set(sessions);
      } else {
        const [entries, sessions] = await Promise.all([
          this.api.mine(this.mode === 'interviews'),
          this.mode === 'interviews' ? this.api.list() : Promise.resolve([]),
        ]);
        if (generation === this.generation) {
          this.entries.set(entries);
          this.sessions.set(sessions.filter((s) => s.interviewer));
        }
      }
      if (generation === this.generation) this.error.set('');
    } catch (error) {
      if (generation !== this.generation) return;
      this.error.set(appointmentError(error));
      // Private names disappear immediately if an authoritative read fails.
      this.entries.set([]);
      this.sessions.set([]);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  time(value: string, timezone: string) {
    return new Intl.DateTimeFormat(this.direction.language() === 'ar' ? 'ar-EG' : 'en-GB', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
      numberingSystem: 'latn',
    }).format(new Date(value));
  }
  dateKey(value: string, timezone: string) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date(value))
        .map((p) => [p.type, p.value]),
    );
    return `${parts['year']}-${parts['month']}-${parts['day']}`;
  }
  canCancel(entry: AppointmentEntry) {
    return (
      entry.status === 'BOOKED' &&
      this.clock.now() < Date.parse(entry.starts_at) - entry.cutoff_minutes * 60000
    );
  }
  canAttend(entry: AppointmentEntry) {
    return entry.status === 'BOOKED' && Date.parse(entry.starts_at) <= this.clock.now();
  }
  async cancel() {
    const entry = this.confirm();
    if (!entry) return;
    await this.mutate('CANCEL', { booking_id: entry.id, version: entry.version });
  }
  async attend(entry: AppointmentEntry, status: 'COMPLETED' | 'NO_SHOW') {
    await this.mutate('ATTEND', { booking_id: entry.id, version: entry.version, status });
  }
  private async mutate(action: 'CANCEL' | 'ATTEND', payload: Record<string, unknown>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.write(action, payload);
      this.confirm.set(null);
      this.toast.show('appointments.saved');
      await this.refresh(false);
    } catch (error) {
      this.error.set(appointmentError(error));
      this.confirm.set(null);
    } finally {
      this.busy.set(false);
    }
  }
  async retry() {
    this.busy.set(true);
    try {
      await this.api.retry();
      this.toast.show('appointments.saved');
      await this.refresh(false);
    } catch (error) {
      this.error.set(appointmentError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
