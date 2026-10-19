import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventReportApi, EventRecap, completionReady } from '../../core/events/event-report-api';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { localizedName } from '../public/public-helpers';
import { ManageContext } from './manage-context';

@Component({
  selector: 'app-recap-page',
  imports: [TranslocoDirective, DsBottomSheet, DsPhoneLink],
  templateUrl: './recap-page.html',
  styleUrl: './recap-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecapPage {
  private readonly api = inject(EventReportApi);
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthStore);
  private readonly context = inject(ManageContext);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.parent!.paramMap, {
    initialValue: this.route.parent!.snapshot.paramMap,
  });
  readonly eventId = computed(() => this.params().get('eventId') ?? '');
  readonly direction = inject(DirectionService);
  readonly report = signal<EventRecap | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly confirming = signal(false);
  readonly pendingOp = signal<string | null>(null);
  readonly ready = computed(() => !!this.report() && completionReady(this.report()!));
  readonly activePlayers = computed(
    () => this.report()?.players.filter((p) => p.status === 'ACTIVE').length ?? 0,
  );
  readonly staffCount = computed(() => new Set(this.report()?.staff.map((s) => s.member_id)).size);
  readonly name = localizedName;
  matchCount(status: string) {
    return this.report()?.matches.filter((match) => match.status === status).length ?? 0;
  }
  private generation = 0;
  constructor() {
    effect(() => {
      const event = this.eventId();
      this.pendingOp.set(null);
      this.confirming.set(false);
      if (event) untracked(() => void this.load(event));
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.report.set(null);
      this.context.eventLabel.set('');
    });
  }
  async load(eventId = this.eventId()) {
    const generation = ++this.generation;
    this.report.set(null);
    this.loading.set(true);
    this.error.set('');
    try {
      const report = await this.api.recap(eventId);
      if (generation !== this.generation) return;
      this.report.set(report);
      this.context.eventLabel.set(
        `${this.name(report.event, this.direction.language())} · ${report.event.code}`,
      );
    } catch {
      if (generation === this.generation) this.error.set('loadFailed');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  date(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(this.direction.language() === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Cairo',
    }).format(new Date(value));
  }
  async print() {
    await this.document.fonts?.ready;
    if (this.report()) this.document.defaultView?.print();
  }
  prepareFinish() {
    if (this.ready() && !this.pendingOp()) this.confirming.set(true);
  }
  async finish() {
    if (this.busy()) return;
    const eventId = this.eventId();
    const member = this.auth.profile()?.id;
    const opId = this.pendingOp() ?? crypto.randomUUID();
    this.pendingOp.set(opId);
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.finish(eventId, opId);
      if (this.auth.profile()?.id !== member || this.eventId() !== eventId) return;
      this.pendingOp.set(null);
      this.confirming.set(false);
      await this.load(eventId);
    } catch (error) {
      if (this.auth.profile()?.id !== member || this.eventId() !== eventId) return;
      const message = (error as { message?: string }).message;
      if (
        message === 'EVENT_INCOMPLETE' ||
        message === 'EVENT_FINISHED' ||
        message === 'FORBIDDEN'
      ) {
        this.pendingOp.set(null);
        this.confirming.set(false);
        await this.load(eventId);
        this.error.set(message === 'EVENT_INCOMPLETE' ? 'incomplete' : 'finishFailed');
      } else this.error.set('retryFinish');
    } finally {
      this.busy.set(false);
    }
  }
}
