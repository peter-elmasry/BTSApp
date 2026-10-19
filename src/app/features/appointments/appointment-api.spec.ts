import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth.store';
import { RpcTransport } from '../../core/offline/rpc-transport';
import { AppointmentApi } from './appointment-api';

describe('private online appointment operations', () => {
  const session = signal<{ user: { id: string } } | null>({ user: { id: 'actor-a' } });
  const profile = signal<{ id: string } | null>({ id: 'member-a' });
  const transport = { rpc: vi.fn(), mutate: vi.fn() };
  beforeEach(() => {
    session.set({ user: { id: 'actor-a' } });
    profile.set({ id: 'member-a' });
    transport.rpc.mockReset();
    transport.mutate.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session, profile } },
        { provide: RpcTransport, useValue: transport },
      ],
    });
  });
  it('reconciles a lost response before repeating a confirmed reservation', async () => {
    transport.rpc
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    transport.mutate.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const api = TestBed.inject(AppointmentApi);
    await expect(api.write('BOOK', { slot_id: 'slot', display_name: 'Member' })).rejects.toThrow();
    const op = api.pending()!.opId;
    await expect(api.retry()).rejects.toThrow();
    expect(api.pending()!.opId).toBe(op);
    transport.rpc.mockResolvedValueOnce({ id: 'booking', version: 1 });
    expect(await api.retry()).toEqual({ id: 'booking', version: 1 });
    expect(transport.mutate).toHaveBeenCalledTimes(1);
    expect(api.pending()).toBeNull();
  });
  it('keeps the same operation and immutable payload when replay is needed', async () => {
    transport.rpc.mockResolvedValue(null);
    transport.mutate
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ id: 'booking' });
    const api = TestBed.inject(AppointmentApi);
    const payload = { slot_id: 'original' };
    await expect(api.write('BOOK', payload)).rejects.toThrow();
    payload.slot_id = 'edited';
    await api.retry();
    const first = transport.mutate.mock.calls[0][1],
      second = transport.mutate.mock.calls[1][1];
    expect(first.p_op_id).toBe(second.p_op_id);
    expect(second.p_payload).toEqual({ slot_id: 'original' });
  });
  it('does not keep business failures as pending reservations', async () => {
    transport.rpc.mockResolvedValue(null);
    transport.mutate.mockRejectedValue({ code: 'P0001', message: 'SLOT_TAKEN' });
    const api = TestBed.inject(AppointmentApi);
    await expect(api.write('BOOK', { slot_id: 'taken' })).rejects.toEqual({
      code: 'P0001',
      message: 'SLOT_TAKEN',
    });
    expect(api.pending()).toBeNull();
  });
  it('rejects a private response that arrives after the account changed', async () => {
    let finish!: (data: unknown) => void;
    transport.rpc.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const api = TestBed.inject(AppointmentApi);
    const read = api.mine(true);
    profile.set({ id: 'member-b' });
    session.set({ user: { id: 'actor-b' } });
    finish([{ display_name: 'old private attendee' }]);
    await expect(read).rejects.toThrow('ACTOR_CHANGED');
  });
  it('never replays the previous account operation', async () => {
    transport.rpc.mockResolvedValue(null);
    transport.mutate.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const api = TestBed.inject(AppointmentApi);
    await expect(api.write('BOOK', { slot_id: 'slot' })).rejects.toThrow();
    profile.set({ id: 'member-b' });
    session.set({ user: { id: 'actor-b' } });
    await expect(api.retry()).rejects.toThrow('ACTOR_CHANGED');
    expect(api.pending()).toBeNull();
    expect(transport.mutate).toHaveBeenCalledTimes(1);
  });
});
