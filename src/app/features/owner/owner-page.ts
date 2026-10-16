import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { DsSearchSelect } from '../../shared/ui/search-select';
import {
  DsCellDef,
  DsDataTable,
  type DsColumn,
  type DsRowStatus,
} from '../../shared/ui/data-table';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { TranslocoDirective } from '@jsverse/transloco';
import { supabase } from '../../core/supabase/client';
import { DsButton } from '../../shared/ui/button';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventChannelService } from '../../core/realtime/event-channel.service';
import { entityLabel } from '../../core/i18n/entity-label';

type Member = {
  id: string;
  username: string;
  phone: string | null;
  full_name_en: string;
  full_name_ar: string | null;
  system_role: string;
  is_active: boolean;
  has_login: boolean;
};
type EventRow = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string | null;
  status: string;
  is_current: boolean;
  starts_on: string | null;
  admin_ids: string[];
};

@Component({
  selector: 'app-owner-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    TranslocoDirective,
    DsButton,
    DsBottomSheet,
    DsSearchSelect,
    DsDataTable,
    DsCellDef,
    DsPhoneLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './owner-page.html',
})
export class OwnerPage implements OnInit {
  constructor() {
    const channel = inject(EventChannelService);
    let initialized = false;
    effect(() => {
      channel.revision();
      if (initialized) untracked(() => void this.reload());
      initialized = true;
    });
  }
  private readonly direction = inject(DirectionService);
  label(row: Member | EventRow, field = 'name') {
    return entityLabel(row, this.direction.language(), field);
  }
  private readonly route = inject(ActivatedRoute);
  private readonly queue = inject(OpQueueService);
  private readonly cache = inject(ReadCacheService);
  readonly section = this.route.snapshot.routeConfig?.path?.endsWith('events')
    ? 'events'
    : 'members';
  readonly members = signal<Member[]>([]);
  /** Active members for the searchable admin picker (lists over ten get a search box). */
  readonly memberOptions = computed(() =>
    this.members()
      .filter((member) => member.is_active)
      .map((member) => ({
        value: member.id,
        label: `${this.label(member, 'full_name') || member.username} (@${member.username})`,
      })),
  );
  readonly events = signal<EventRow[]>([]);
  readonly query = signal('');
  readonly notice = signal('');
  readonly pendingOperation = signal('');
  readonly busy = signal(false);
  readonly editing = signal<string | null>(null);
  readonly adminSelection = signal<Record<string, string>>({});
  /** BTS-<year>, with -2, -3… when that code is taken (U8). */
  readonly defaultCode = computed(() => {
    const year = new Date().getFullYear();
    const taken = new Set(this.events().map((event) => event.code.toUpperCase()));
    let code = `BTS-${year}`;
    for (let n = 2; taken.has(code); n++) code = `BTS-${year}-${n}`;
    return code;
  });
  readonly trackMember = (member: Member) => member.id;
  readonly memberSearch = (member: Member) =>
    `${member.username} ${member.phone ?? ''} ${member.full_name_en} ${member.full_name_ar ?? ''}`;
  readonly memberStatus = (member: Member): DsRowStatus => (member.is_active ? null : 'void');
  memberColumns(t: (key: string) => string): DsColumn<Member>[] {
    return [
      { key: 'name', header: t('owner.memberColumn'), rowHeader: true },
      { key: 'phone', header: t('owner.phone') },
      { key: 'status', header: t('results.status') },
      { key: 'actions', header: t('results.actions'), align: 'end' },
    ];
  }
  readonly filteredMembers = () => {
    const q = this.query().trim().toLowerCase();
    return this.members().filter(
      (m) =>
        !q ||
        `${m.username} ${m.phone ?? ''} ${m.full_name_en} ${m.full_name_ar ?? ''}`
          .toLowerCase()
          .includes(q),
    );
  };
  readonly memberForm = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    phone: new FormControl('', { nonNullable: true }),
    full_name_en: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    full_name_ar: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
  });
  readonly eventForm = new FormGroup({
    code: new FormControl('', { nonNullable: true }),
    name_en: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name_ar: new FormControl('', { nonNullable: true }),
    starts_on: new FormControl('', { nonNullable: true }),
  });
  async ngOnInit() {
    await this.reload();
  }
  async reload() {
    try {
      const [members, events] = await Promise.all([
        this.cache.read<Member[]>('list_members', {}, true),
        this.cache.read<EventRow[]>('list_events', {}, true),
      ]);
      this.members.set(members ?? []);
      this.events.set(events ?? []);
    } catch {
      this.notice.set('errors.LOAD_FAILED');
    }
  }
  async saveMember() {
    if (this.memberForm.invalid || this.busy()) return;
    this.busy.set(true);
    this.notice.set('');
    const value = this.memberForm.getRawValue();
    const id = this.editing();
    const result = await supabase.functions.invoke('members', {
      body: {
        action: id ? 'update' : 'create',
        ...(id ? { member_id: id } : {}),
        ...value,
        // One name per member (D054): both columns hold the same text.
        full_name_ar: value.full_name_en,
        password: id ? undefined : value.password || undefined,
      },
    });
    this.busy.set(false);
    if (this.showPendingOperation(result.data)) {
      this.cancelEdit();
      await this.reload();
      return;
    }
    if (result.error || result.data?.error) {
      this.notice.set(`errors.${result.data?.error || 'SAVE_FAILED'}`);
      return;
    }
    this.notice.set('owner.memberSaved');
    this.cancelEdit();
    await this.reload();
  }
  /** Add/edit happens in a sheet so the member list comes first (product owner, 2026-10-13). */
  readonly memberSheet = signal(false);
  /** Member whose ⋯ actions sheet is open. */
  readonly actionMember = signal<Member | null>(null);
  readonly memberFilters = ['all', 'active', 'inactive'] as const;
  readonly memberFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly visibleMembers = computed(() => {
    const filter = this.memberFilter();
    return this.members().filter((member) =>
      filter === 'all' ? true : filter === 'active' ? member.is_active : !member.is_active,
    );
  });
  memberCount(filter: 'all' | 'active' | 'inactive') {
    const members = this.members();
    if (filter === 'all') return members.length;
    return members.filter((member) => member.is_active === (filter === 'active')).length;
  }
  openCreate() {
    this.cancelEdit();
    this.memberSheet.set(true);
  }
  edit(member: Member) {
    this.actionMember.set(null);
    this.memberSheet.set(true);
    this.editing.set(member.id);
    this.memberForm.patchValue({
      username: member.username,
      phone: member.phone ?? '',
      full_name_en: member.full_name_ar || member.full_name_en,
      full_name_ar: member.full_name_ar ?? '',
    });
  }
  cancelEdit() {
    this.memberSheet.set(false);
    this.editing.set(null);
    this.memberForm.reset({
      username: '',
      phone: '',
      full_name_en: '',
      full_name_ar: '',
      password: '',
    });
  }
  readonly passwordMember = signal<Member | null>(null);
  readonly passwordError = signal('');
  readonly passwordForm = new FormGroup({
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12)],
    }),
    confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  openPassword(member: Member) {
    this.actionMember.set(null);
    this.passwordForm.reset({ password: '', confirm: '' });
    this.passwordError.set('');
    this.passwordMember.set(member);
  }
  closePassword() {
    if (this.busy()) return;
    // Never keep a typed password around after the sheet closes.
    this.passwordForm.reset({ password: '', confirm: '' });
    this.passwordMember.set(null);
  }
  async savePassword() {
    const member = this.passwordMember();
    if (!member || this.busy()) return;
    const { password, confirm } = this.passwordForm.getRawValue();
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.passwordError.set('owner.passwordTooShort');
      return;
    }
    if (password !== confirm) {
      this.passwordError.set('owner.passwordMismatch');
      return;
    }
    await this.setPassword(member, password);
    this.passwordForm.reset({ password: '', confirm: '' });
    this.passwordMember.set(null);
  }
  async setPassword(member: Member, password: string) {
    if (this.busy()) return;
    this.busy.set(true);
    const { error, data } = await supabase.functions.invoke('members', {
      body: { action: 'set_password', member_id: member.id, password },
    });
    this.busy.set(false);
    if (this.showPendingOperation(data)) {
      await this.reload();
      return;
    }
    this.notice.set(
      error || data?.error ? `errors.${data?.error || 'SAVE_FAILED'}` : 'owner.passwordSaved',
    );
    await this.reload();
  }
  async toggleActive(member: Member) {
    if (this.busy()) return;
    this.busy.set(true);
    const action = member.is_active ? 'deactivate' : 'reactivate';
    const { error, data } = await supabase.functions.invoke('members', {
      body: { action, member_id: member.id },
    });
    this.busy.set(false);
    if (this.showPendingOperation(data)) {
      await this.reload();
      return;
    }
    this.notice.set(
      error || data?.error ? `errors.${data?.error || 'SAVE_FAILED'}` : 'owner.memberSaved',
    );
    await this.reload();
  }
  async createEvent() {
    if (this.eventForm.invalid || this.busy()) return;
    const v = this.eventForm.getRawValue();
    const accepted = await this.mutate('create_event', {
      p_code: (v.code.trim() || this.defaultCode()).toUpperCase(),
      p_name_en: v.name_en,
      p_name_ar: v.name_en,
      p_starts_on: v.starts_on || null,
    });
    if (accepted) {
      this.eventForm.reset({ code: '', name_en: '', name_ar: '', starts_on: '' });
    }
  }
  private showPendingOperation(data: { status?: string; operation_id?: string } | null): boolean {
    if (data?.status !== 'needs_review') return false;
    this.pendingOperation.set(data.operation_id ?? '');
    this.notice.set('');
    return true;
  }
  async setCurrent(event: EventRow) {
    await this.mutate('set_current_event', {
      p_event: event.id,
    });
  }
  selectAdmin(eventId: string, memberId: string) {
    this.adminSelection.update((v) => ({ ...v, [eventId]: memberId }));
  }
  async assignAdmin(event: EventRow) {
    const memberId = this.adminSelection()[event.id];
    if (!memberId) {
      this.notice.set('owner.chooseMemberError');
      return;
    }
    await this.mutate('assign_event_admin', {
      p_event: event.id,
      p_member: memberId,
    });
  }
  async removeAdmin(event: EventRow, memberId: string) {
    await this.mutate('remove_event_admin', {
      p_event: event.id,
      p_member: memberId,
    });
  }
  private async mutate(name: string, args: Record<string, unknown>): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      const receipt = await this.queue.execute(name, args);
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'owner.eventSaved');
      if (receipt.status === 'sent') await this.reload();
      return true;
    } catch (error) {
      const failure = error as { message?: string; code?: string };
      this.notice.set(`errors.${failure.message || failure.code || 'SAVE_FAILED'}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  memberLabel(id: string) {
    const m = this.members().find((x) => x.id === id);
    return m ? `${this.label(m, 'full_name') || m.username} (@${m.username})` : id;
  }
}
