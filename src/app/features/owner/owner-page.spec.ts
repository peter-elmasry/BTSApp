import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { supabase } from '../../core/supabase/client';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { OwnerPage } from './owner-page';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventChannelService } from '../../core/realtime/event-channel.service';
import { signal } from '@angular/core';
import { ToastService } from '../../shared/ui/toast';

describe('owner member operation reconciliation', () => {
  const member = {
    id: 'member',
    username: 'guide',
    phone: null,
    full_name_en: 'Guide',
    full_name_ar: null,
    system_role: 'MEMBER',
    is_active: true,
    has_login: true,
  };
  let page: OwnerPage;
  const read = vi.fn();
  const invoke = vi.fn();
  const show = vi.fn();
  beforeEach(() => {
    show.mockReset();
    read.mockReset().mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: { show } },
        { provide: DirectionService, useValue: { language: () => 'en' } },
        { provide: EventChannelService, useValue: { revision: signal(0) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { routeConfig: { path: 'owner/members' } } },
        },
        { provide: OpQueueService, useValue: {} },
        { provide: ReadCacheService, useValue: { read } },
      ],
    });
    page = TestBed.runInInjectionContext(() => new OwnerPage());
    invoke.mockReset().mockResolvedValue({
      error: null,
      data: { ok: false, status: 'needs_review', operation_id: 'operation-reference' },
    });
    // Supabase returns a new FunctionsClient on each getter access.
    vi.spyOn(supabase, 'functions', 'get').mockReturnValue({ invoke } as never);
  });
  afterEach(() => vi.restoreAllMocks());
  it('clears a submitted password and shows pending creation rather than saved', async () => {
    page.memberForm.patchValue({
      username: 'guide',
      full_name_en: 'Guide',
      password: 'fixture-password',
    });
    await page.saveMember();
    expect(page.pendingOperation()).toBe('operation-reference');
    expect(page.notice()).not.toBe('owner.memberSaved');
    expect(show).not.toHaveBeenCalled();
    expect(page.memberForm.controls.password.value).toBe('');
  });
  it('refreshes member lists from the server after creation and deactivation', async () => {
    invoke.mockResolvedValue({ error: null, data: { ok: true } });
    read.mockImplementation(async (name: string) => (name === 'list_members' ? [member] : []));
    page.memberForm.patchValue({ username: 'guide', full_name_en: 'Guide' });
    await page.saveMember();
    expect(show).toHaveBeenCalledWith('owner.memberSaved');
    expect(page.members()).toEqual([member]);
    expect(read).toHaveBeenCalledWith('list_members', {}, true);
    read.mockImplementation(async (name: string) =>
      name === 'list_members' ? [{ ...member, is_active: false }] : [],
    );
    await page.toggleActive(member);
    expect(page.members()[0].is_active).toBe(false);
    expect(read).toHaveBeenCalledWith('list_events', {}, true);
  });
  it('shows a pending password reset without announcing success', async () => {
    page.openPassword(member);
    page.passwordForm.setValue({ password: 'fixture-password', confirm: 'fixture-password' });
    await page.savePassword();
    expect(page.pendingOperation()).toBe('operation-reference');
    expect(page.notice()).not.toBe('owner.passwordSaved');
    expect(show).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(page.passwordMember()).toBeNull();
    expect(page.passwordForm.controls.password.value).toBe('');
  });
  it('rejects short or mismatched passwords before calling the server', async () => {
    page.openPassword(member);
    page.passwordForm.setValue({ password: 'short', confirm: 'short' });
    await page.savePassword();
    expect(page.passwordError()).toBe('owner.passwordTooShort');
    page.passwordForm.setValue({ password: 'fixture-password', confirm: 'different-password' });
    await page.savePassword();
    expect(page.passwordError()).toBe('owner.passwordMismatch');
    expect(invoke).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });
  it('shows pending activation changes without announcing success', async () => {
    await page.toggleActive(member);
    expect(page.pendingOperation()).toBe('operation-reference');
    expect(page.notice()).not.toBe('owner.memberSaved');
    expect(show).not.toHaveBeenCalled();
  });
  it('does not announce failed member or password writes as saved', async () => {
    invoke.mockResolvedValue({ error: new Error('network failure'), data: null });
    page.memberForm.patchValue({ username: 'guide', full_name_en: 'Guide' });
    await page.saveMember();
    await page.toggleActive(member);
    await page.setPassword(member, 'synthetic-test-password');
    expect(show).not.toHaveBeenCalled();
  });
});
