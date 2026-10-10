import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';
import { actorIdentity } from './rpc-errors';
import { RpcTransport } from './rpc-transport';

describe('RPC identity snapshot', () => {
  const session = signal<{ user: { id: string }; access_token: string } | null>(null);
  const profile = signal<{ id: string } | null>(null);
  const fetchRequest = vi.fn();
  beforeEach(() => {
    session.set({ user: { id: 'a' }, access_token: 'test-bearer-a' });
    profile.set({ id: 'member-a' });
    fetchRequest
      .mockReset()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchRequest);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { session, profile } }],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the read caller bearer even if the active identity changes before the response', async () => {
    const transport = TestBed.inject(RpcTransport);
    const pending = transport.rpc('get_schedule', { p_event: 'event' });
    session.set({ user: { id: 'b' }, access_token: 'test-bearer-b' });
    await pending;
    expect(fetchRequest.mock.calls[0][1].headers.Authorization).toBe('Bearer test-bearer-a');
  });

  it('never sends a queued mutation for a mismatched member or user', async () => {
    const transport = TestBed.inject(RpcTransport);
    const otherActor = actorIdentity('other-user', 'other-member', environment.supabaseUrl)!;
    await expect(transport.mutate('start_round', {}, otherActor)).rejects.toMatchObject({
      code: 'ACTOR_CHANGED',
    });
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
