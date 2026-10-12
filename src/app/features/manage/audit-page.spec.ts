import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuditApi, type AuditPage as Response } from '../../core/audit/audit-api';
import { AuthStore, type StaffProfile } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { AuditPage } from './audit-page';

const response = (id: string, next: string | null = null): Response => ({
  items: [
    {
      id,
      at: '2026-10-12T10:00:00Z',
      action: 'TEAM_UPDATED',
      entity: 'team',
      entity_id: null,
      actor: null,
      before: null,
      after: { name_en: id },
    },
  ],
  next_before: next,
  actions: ['TEAM_UPDATED'],
  entities: ['team'],
});
describe('audit history context and pagination', () => {
  let page: AuditPage;
  const profile = signal<StaffProfile | null>(null);
  const session = signal<{ user: { id: string } } | null>(null);
  const api = { read: vi.fn() };
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  async function settle() {
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();
  }
  beforeEach(async () => {
    api.read.mockReset().mockResolvedValue(response('3', '3'));
    profile.set({ id: 'owner', system_role: 'OWNER', roles: [] } as unknown as StaffProfile);
    session.set({ user: { id: 'owner-auth' } });
    params = new BehaviorSubject(convertToParamMap({ eventId: 'event' }));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuditApi, useValue: api },
        { provide: AuthStore, useValue: { profile, session } },
        { provide: DirectionService, useValue: { language: signal('en') } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params.asObservable(), snapshot: { paramMap: params.value } },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new AuditPage());
    await settle();
  });
  it('uses the server cursor and applied filters for older pages', async () => {
    api.read.mockResolvedValueOnce(response('2'));
    page.more();
    await settle();
    expect(api.read).toHaveBeenLastCalledWith('event', '3', '', '');
    expect(page.rows().map((row) => row.id)).toEqual(['3', '2']);
    page.filters.setValue({ action: 'TEAM_UPDATED', entity: 'team' });
    page.apply();
    await settle();
    expect(api.read).toHaveBeenLastCalledWith('event', null, 'TEAM_UPDATED', 'team');
    expect(page.rows()).toHaveLength(1);
  });
  it('discards superseded filter responses', async () => {
    let resolve!: (value: Response) => void;
    api.read.mockReturnValueOnce(new Promise<Response>((done) => (resolve = done)));
    page.refresh();
    page.filters.controls.action.setValue('ROUND_STARTED');
    api.read.mockResolvedValueOnce(response('new'));
    page.apply();
    await settle();
    resolve(response('stale'));
    await settle();
    expect(page.rows()[0].id).toBe('new');
  });
  it('hides entries immediately on logout and ignores a late read', async () => {
    let resolve!: (value: Response) => void;
    api.read.mockReturnValueOnce(new Promise<Response>((done) => (resolve = done)));
    page.more();
    session.set(null);
    expect(page.rows()).toEqual([]);
    await settle();
    resolve(response('private'));
    await settle();
    expect(page.rows()).toEqual([]);
    expect(page.next()).toBeNull();
  });
  it('does not load for an event referee or revoked administrator', async () => {
    profile.set({
      id: 'ref',
      system_role: 'MEMBER',
      roles: [{ event_id: 'event', role: 'REFEREE' }],
    } as unknown as StaffProfile);
    await settle();
    expect(page.rows()).toEqual([]);
    expect(api.read).toHaveBeenCalledTimes(1);
  });
  it('clears existing rows when pagination is forbidden', async () => {
    api.read.mockRejectedValueOnce({ message: 'FORBIDDEN' });
    page.more();
    await settle();
    expect(page.rows()).toEqual([]);
    expect(page.error()).toBe('errors.FORBIDDEN');
  });
  it('retains the cursor on a transient failure for a safe retry', async () => {
    api.read.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    page.more();
    await settle();
    expect(page.rows()[0].id).toBe('3');
    expect(page.next()).toBe('3');
    api.read.mockResolvedValueOnce(response('2'));
    page.more();
    await settle();
    expect(page.rows().map((row) => row.id)).toEqual(['3', '2']);
  });
  it('discards the previous event while a new event loads', async () => {
    api.read.mockResolvedValueOnce(response('other'));
    params.next(convertToParamMap({ eventId: 'other' }));
    await settle();
    expect(api.read).toHaveBeenLastCalledWith('other', null, '', '');
    expect(page.rows()[0].id).toBe('other');
  });
});
