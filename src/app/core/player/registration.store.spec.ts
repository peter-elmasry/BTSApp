import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../auth/auth.store';
import { EventStore } from './event.store';
import { RegistrationApi, RegistrationReceipt, registrationError } from './registration-api';
import { RegistrationStore } from './registration.store';

describe('private device registration', () => {
  const event = signal<{ id: string } | null>({ id: 'event' });
  const profile = signal<unknown>(null);
  const rpc = vi.fn();
  const receipt: RegistrationReceipt = {
    id: 'player',
    event_id: 'event',
    team_id: 'team-1',
    team_code: 'T01',
    status: 'ACTIVE',
    version: 1,
  };
  beforeEach(() => {
    localStorage.clear();
    event.set({ id: 'event' });
    profile.set(null);
    rpc.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { profile } },
        { provide: EventStore, useValue: { event } },
        { provide: RegistrationApi, useValue: { rpc } },
      ],
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it('persists a strong receipt before sending, without persisting player details', async () => {
    rpc.mockImplementation(async (_name, args) => {
      const stored = JSON.parse(localStorage.getItem('bts.registration.event')!);
      expect(stored.secret).toBe(args.p_secret);
      expect(args.p_secret).toMatch(/^[a-f0-9]{64}$/);
      return receipt;
    });
    const store = TestBed.inject(RegistrationStore);
    await store.join('event', 'token', 'Private Name', '01012345678', 'operation');
    expect(store.receipt()).toEqual(receipt);
    expect(localStorage.getItem('bts.registration.event')).not.toMatch(/Private Name|01012345678/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('reuses the device secret after a lost response and recognizes the saved membership', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(receipt);
    const store = TestBed.inject(RegistrationStore);
    await expect(store.join('event', 'token', 'Name', '', 'one')).rejects.toThrow();
    await store.join('event', 'token', 'Name', '', 'one');
    expect(rpc.mock.calls[0][1].p_secret).toBe(rpc.mock.calls[1][1].p_secret);
    expect(store.receipt()).toEqual(receipt);
  });
  it('applies staff transfers and removals but retains the receipt while offline', async () => {
    const store = TestBed.inject(RegistrationStore);
    rpc.mockResolvedValueOnce(receipt);
    await store.join('event', 'token', 'Name', '', 'one');
    rpc.mockResolvedValueOnce({ ...receipt, team_code: 'T02', status: 'REMOVED', version: 3 });
    await store.refresh('event');
    expect(store.receipt()?.team_code).toBe('T02');
    expect(store.receipt()?.status).toBe('REMOVED');
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await store.refresh('event');
    expect(store.receipt()?.status).toBe('REMOVED');
  });
  it('does not overwrite a confirmed join with an earlier null receipt read', async () => {
    localStorage.setItem(
      'bts.registration.event',
      JSON.stringify({ secret: 'a'.repeat(64), receipt: null }),
    );
    let finish!: (value: null) => void;
    rpc
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(receipt);
    const store = TestBed.inject(RegistrationStore);
    const oldRead = store.refresh('event');
    await store.join('event', 'token', 'Name', '', 'one');
    finish(null);
    await oldRead;
    expect(store.receipt()).toEqual(receipt);
  });
  it('isolates events and hides guest receipts when staff signs in', async () => {
    rpc.mockResolvedValue(receipt);
    const store = TestBed.inject(RegistrationStore);
    await store.join('event', 'token', 'Name', '', 'one');
    event.set({ id: 'other' });
    expect(store.receipt()).toBeNull();
    event.set({ id: 'event' });
    expect(store.receipt()).toEqual(receipt);
    profile.set({ id: 'guide' });
    expect(store.receipt()).toBeNull();
  });
  it('does not submit when persistent browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = TestBed.inject(RegistrationStore);
    await expect(store.join('event', 'token', 'Name', '', 'one')).rejects.toThrow(
      'STORAGE_REQUIRED',
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it('ignores malformed stored receipts', () => {
    localStorage.setItem('bts.registration.event', '{broken');
    expect(TestBed.inject(RegistrationStore).receipt()).toBeNull();
  });
  it('uses a bounded set of useful error messages', () => {
    expect(registrationError(new TypeError('Failed to fetch'))).toBe('OFFLINE');
    expect(registrationError({ message: 'REGISTRATION_CHANGED', code: 'P0001' })).toBe(
      'REGISTRATION_CHANGED',
    );
    expect(registrationError({ message: 'private database detail', code: 'XX001' })).toBe(
      'SAVE_FAILED',
    );
  });
});
