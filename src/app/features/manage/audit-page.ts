import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuditApi, type AuditEntry, type AuditJson } from '../../core/audit/audit-api';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { rpcFailure } from '../../core/offline/rpc-errors';
import { isLiveAdmin } from '../live/live-helpers';
import { localizedName } from '../public/public-helpers';

@Component({
  selector: 'app-audit-page',
  imports: [TranslocoDirective, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-page.html',
})
export class AuditPage {
  private readonly api = inject(AuditApi);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  readonly direction = inject(DirectionService);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly eventId = computed(() => this.params().get('eventId') ?? '');
  readonly allowed = computed(
    () => !!this.auth.session() && isLiveAdmin(this.auth.profile(), this.eventId()),
  );
  private readonly context = computed(() =>
    JSON.stringify([
      this.eventId(),
      this.auth.session()?.user.id,
      this.auth.profile()?.id,
      this.auth.profile()?.system_role,
      this.auth.profile()?.roles,
    ]),
  );
  private readonly entries = signal<AuditEntry[]>([]);
  private readonly responseContext = signal('');
  readonly rows = computed(() =>
    this.allowed() && this.context() === this.responseContext() ? this.entries() : [],
  );
  readonly loading = signal(false);
  readonly error = signal('');
  readonly actions = signal<string[]>([]);
  readonly entities = signal<string[]>([]);
  readonly next = signal<string | null>(null);
  readonly filters = new FormGroup({
    action: new FormControl('', { nonNullable: true }),
    entity: new FormControl('', { nonNullable: true }),
  });
  readonly name = localizedName;
  private applied = { action: '', entity: '' };
  private request = 0;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
    });
    effect(() => {
      this.context();
      const allowed = this.allowed();
      untracked(() => {
        this.request++;
        this.entries.set([]);
        this.actions.set([]);
        this.entities.set([]);
        this.next.set(null);
        this.error.set('');
        this.loading.set(false);
        this.filters.reset();
        this.applied = { action: '', entity: '' };
        if (allowed) void this.load(false);
      });
    });
  }
  apply() {
    this.applied = this.filters.getRawValue();
    void this.load(false);
  }
  refresh() {
    void this.load(false);
  }
  more() {
    if (this.next() && !this.loading()) void this.load(true);
  }
  format(value: AuditJson) {
    return JSON.stringify(value, null, 2);
  }
  time(value: string) {
    return new Intl.DateTimeFormat(this.direction.language() === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'Africa/Cairo',
    }).format(new Date(value));
  }
  private async load(append: boolean) {
    if (!this.allowed()) return;
    const version = ++this.request;
    const context = this.context();
    const cursor = append ? this.next() : null;
    this.loading.set(true);
    this.error.set('');
    if (!append) {
      this.entries.set([]);
      this.next.set(null);
    }
    const current = () =>
      !this.destroyed && version === this.request && context === this.context() && this.allowed();
    try {
      const page = await this.api.read(
        this.eventId(),
        cursor,
        this.applied.action,
        this.applied.entity,
      );
      if (!current()) return;
      this.entries.set(append ? [...this.entries(), ...page.items] : page.items);
      this.responseContext.set(context);
      this.next.set(page.next_before);
      this.actions.set(page.actions);
      this.entities.set(page.entities);
    } catch (error) {
      if (!current()) return;
      const failure = rpcFailure(error);
      const forbidden = [failure.code, failure.message].some((value) =>
        ['FORBIDDEN', 'UNAUTHENTICATED'].includes(value ?? ''),
      );
      if (forbidden) {
        this.entries.set([]);
        this.next.set(null);
        this.actions.set([]);
        this.entities.set([]);
      }
      this.error.set(forbidden ? 'errors.FORBIDDEN' : 'audit.failed');
    } finally {
      if (current()) this.loading.set(false);
    }
  }
}
