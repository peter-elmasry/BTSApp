import { TestBed } from '@angular/core/testing';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AuthStore, type StaffProfile } from './auth.store';
import { OfflineDb } from '../offline/offline-db';

const profile: StaffProfile = {
  id: 'member-a',
  username: 'referee',
  phone: '+201000000000',
  full_name_en: 'Referee',
  full_name_ar: null,
  system_role: 'MEMBER',
  roles: [],
  assigned_games: [],
};
const session = (id: string) => ({ user: { id } }) as Session;

describe('staff profile network recovery', () => {
  const db = { cached: vi.fn(), cache: vi.fn(), removeCache: vi.fn() };
  const rpc = vi.fn();
  const signOut = vi.fn();
  let auth: AuthStore;
  beforeEach(() => {
    vi.resetAllMocks();
    db.cache.mockResolvedValue(undefined);
    db.removeCache.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
    TestBed.configureTestingModule({ providers: [{ provide: OfflineDb, useValue: db }] });
    auth = TestBed.inject(AuthStore);
    vi.spyOn(auth as unknown as { client(): Promise<SupabaseClient> }, 'client').mockResolvedValue({
      rpc,
      auth: { signOut },
    } as unknown as SupabaseClient);
    auth.session.set(session('user-a'));
  });

  it('restores only this user’s last-known profile for a network failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch', code: '' } });
    db.cached.mockResolvedValue({ data: { ...profile, phone: null } });
    await auth.loadProfile();
    expect(db.cached.mock.calls[0][0]).toContain('profile:user-a');
    expect(auth.profile()?.id).toBe('member-a');
    expect(auth.ready()).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does not restore cached powers for a server permission rejection', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'UNAUTHORIZED' } });
    await auth.loadProfile();
    expect(auth.profile()).toBeNull();
    expect(db.cached).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
    expect(db.removeCache).toHaveBeenCalled();
  });

  it('keeps the same actor profile during network recovery so staff cache scope stays stable', async () => {
    rpc.mockResolvedValueOnce({ data: profile, error: null });
    await auth.loadProfile();
    let restore!: (value: unknown) => void;
    db.cached.mockReturnValue(new Promise((resolve) => (restore = resolve)));
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch', code: '' } });
    const recovery = auth.loadProfile();
    await vi.waitFor(() => expect(db.cached).toHaveBeenCalledOnce());
    expect(auth.profile()?.id).toBe(profile.id);
    restore({ data: { ...profile, phone: null } });
    await recovery;
    expect(auth.profile()?.id).toBe(profile.id);
  });

  it('discards an in-flight profile from a previous signed-in user', async () => {
    let complete!: (result: unknown) => void;
    rpc.mockReturnValue(new Promise((resolve) => (complete = resolve)));
    const request = auth.loadProfile();
    await Promise.resolve();
    auth.session.set(session('user-b'));
    complete({ data: profile, error: null });
    await request;
    expect(auth.profile()).toBeNull();
    expect(db.cache).not.toHaveBeenCalled();
  });

  it('omits phone information from the durable offline profile', async () => {
    rpc.mockResolvedValue({ data: profile, error: null });
    await auth.loadProfile();
    expect(auth.profile()?.phone).toBe(profile.phone);
    expect(db.cache.mock.calls[0][0].data.phone).toBeNull();
    expect(db.cache.mock.calls[0][0].private).toBe(true);
  });
});
