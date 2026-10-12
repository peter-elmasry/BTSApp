import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { supabase } from '../../core/supabase/client';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService } from '../../core/offline/read-cache.service';
import { OwnerPage } from './owner-page';
import { DirectionService } from '../../core/i18n/i18n.service';

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
  const invoke = vi.fn();
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DirectionService, useValue: { language: () => 'en' } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { routeConfig: { path: 'owner/members' } } },
        },
        { provide: OpQueueService, useValue: {} },
        { provide: ReadCacheService, useValue: { read: async () => [] } },
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
    expect(page.memberForm.controls.password.value).toBe('');
  });
  it('shows a pending password reset without announcing success', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('fixture-password');
    await page.setPassword(member);
    expect(page.pendingOperation()).toBe('operation-reference');
    expect(page.notice()).not.toBe('owner.passwordSaved');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('shows pending activation changes without announcing success', async () => {
    await page.toggleActive(member);
    expect(page.pendingOperation()).toBe('operation-reference');
    expect(page.notice()).not.toBe('owner.memberSaved');
  });
});
