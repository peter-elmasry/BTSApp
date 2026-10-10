import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { supabase } from '../../core/supabase/client';
import { DsButton } from '../../shared/ui/button';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';

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
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive, TranslocoDirective, DsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './owner-page.html',
})
export class OwnerPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly queue = inject(OpQueueService);
  private readonly cache = inject(ReadCacheService);
  readonly section = this.route.snapshot.routeConfig?.path?.endsWith('events')
    ? 'events'
    : 'members';
  readonly members = signal<Member[]>([]);
  readonly events = signal<EventRow[]>([]);
  readonly query = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly editing = signal<string | null>(null);
  readonly adminSelection = signal<Record<string, string>>({});
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
    code: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
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
        this.cache.read<Member[]>('list_members', {}),
        this.cache.read<EventRow[]>('list_events', {}),
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
        password: id ? undefined : value.password || undefined,
      },
    });
    this.busy.set(false);
    if (result.error || result.data?.error) {
      this.notice.set(`errors.${result.data?.error || 'SAVE_FAILED'}`);
      return;
    }
    this.notice.set('owner.memberSaved');
    this.cancelEdit();
    await this.reload();
  }
  edit(member: Member) {
    this.editing.set(member.id);
    this.memberForm.patchValue({
      username: member.username,
      phone: member.phone ?? '',
      full_name_en: member.full_name_en,
      full_name_ar: member.full_name_ar ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  cancelEdit() {
    this.editing.set(null);
    this.memberForm.reset({
      username: '',
      phone: '',
      full_name_en: '',
      full_name_ar: '',
      password: '',
    });
  }
  async setPassword(member: Member) {
    const password = window.prompt(`Set password for ${member.username} (minimum 12 characters)`);
    if (password === null) return;
    const { error, data } = await supabase.functions.invoke('members', {
      body: { action: 'set_password', member_id: member.id, password },
    });
    this.notice.set(
      error || data?.error ? `errors.${data?.error || 'SAVE_FAILED'}` : 'owner.passwordSaved',
    );
    await this.reload();
  }
  async toggleActive(member: Member) {
    const action = member.is_active ? 'deactivate' : 'reactivate';
    const { error, data } = await supabase.functions.invoke('members', {
      body: { action, member_id: member.id },
    });
    this.notice.set(
      error || data?.error ? `errors.${data?.error || 'SAVE_FAILED'}` : 'owner.memberSaved',
    );
    await this.reload();
  }
  async createEvent() {
    if (this.eventForm.invalid || this.busy()) return;
    const v = this.eventForm.getRawValue();
    const accepted = await this.mutate('create_event', {
      p_code: v.code.trim().toUpperCase(),
      p_name_en: v.name_en,
      p_name_ar: v.name_ar || null,
      p_starts_on: v.starts_on || null,
    });
    if (accepted) {
      this.eventForm.reset({ code: '', name_en: '', name_ar: '', starts_on: '' });
    }
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
    return m ? `${m.full_name_en} (@${m.username})` : id;
  }
}
