import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedNotificationTestService } from './shared-notification-test.service';
import { EventAudioService } from './event-audio.service';
import { AuthStore } from '../auth/auth.store';
import { RpcTransport } from '../offline/rpc-transport';
import { EventStore } from '../player/event.store';
import { EventChannelService } from '../realtime/event-channel.service';
import { ToastService } from '../../shared/ui/toast';

describe('shared notification test', () => {
  const event = signal({ id: 'event-one', status: 'LIVE' });
  const profile = signal({
    system_role: 'MEMBER',
    roles: [] as { event_id: string; role: string }[],
  });
  const revision = signal(0);
  const immediate = new Subject<{ eventId: string; event: string; payload: unknown }>();
  let service: SharedNotificationTestService;
  let marker: { id: string; occurredAt: string } | null;
  let fail: string;
  let pending: Promise<unknown> | null;
  const show = vi.fn();
  const preview = vi.fn();
  let rpc: ReturnType<typeof vi.fn>;
  const flush = async () => {
    for (let i = 0; i < 8; i++) {
      TestBed.tick();
      await Promise.resolve();
    }
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    event.set({ id: 'event-one', status: 'LIVE' });
    profile.set({ system_role: 'MEMBER', roles: [] });
    revision.set(0);
    marker = null;
    fail = '';
    pending = null;
    show.mockClear();
    preview.mockClear();
    rpc = vi.fn(async (name: string) => {
      if (name === 'get_notification_test')
        return { serverNow: new Date().toISOString(), test: marker };
      if (pending) {
        const result = pending;
        pending = null;
        return result;
      }
      if (fail) throw { code: 'P0001', message: fail };
      return { devices: 3 };
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: EventStore, useValue: { event } },
        { provide: AuthStore, useValue: { profile } },
        { provide: RpcTransport, useValue: { rpc } },
        { provide: EventChannelService, useValue: { revision, immediate } },
        { provide: EventAudioService, useValue: { preview } },
        { provide: ToastService, useValue: { show } },
      ],
    });
    service = TestBed.inject(SharedNotificationTestService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('limits the sending action to owners and current-event administrators', async () => {
    await flush();
    await service.send();
    expect(rpc.mock.calls.some(([name]) => name === 'test_event_notifications')).toBe(false);
    profile.set({ system_role: 'MEMBER', roles: [{ event_id: 'other', role: 'EVENT_ADMIN' }] });
    expect(service.canSend()).toBe(false);
    profile.set({ system_role: 'MEMBER', roles: [{ event_id: 'event-one', role: 'EVENT_ADMIN' }] });
    expect(service.canSend()).toBe(true);
    event.set({ ...event(), status: 'FINISHED' });
    expect(service.canSend()).toBe(false);
  });
  it('skips history, announces a fresh occurrence once and recovers through the existing revision probe', async () => {
    marker = { id: 'baseline', occurredAt: new Date().toISOString() };
    await flush();
    expect(show).not.toHaveBeenCalled();
    marker = { id: 'new-test', occurredAt: new Date().toISOString() };
    revision.update((n) => n + 1);
    await flush();
    expect(show).toHaveBeenCalledExactlyOnceWith('audio.sharedReceived');
    expect(preview).toHaveBeenCalledExactlyOnceWith('round-start');
    immediate.next({ eventId: 'event-one', event: 'settings_changed', payload: {} });
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
    marker = { id: 'stale', occurredAt: new Date(Date.now() - 20000).toISOString() };
    revision.update((n) => n + 1);
    await flush();
    expect(show).toHaveBeenCalledTimes(1);
  });
  it('ignores wrong-event broadcasts and old in-flight responses after switching events', async () => {
    await flush();
    rpc.mockClear();
    immediate.next({ eventId: 'other', event: 'settings_changed', payload: {} });
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    revision.update((n) => n + 1);
    await flush();
    event.set({ id: 'other', status: 'LIVE' });
    await flush();
    resolve({
      serverNow: new Date().toISOString(),
      test: { id: 'late', occurredAt: new Date().toISOString() },
    });
    await flush();
    expect(show).not.toHaveBeenCalled();
  });
  it('retains an operation ID after an ambiguous failure and guards double taps and cooldown', async () => {
    profile.set({ system_role: 'OWNER', roles: [] });
    await flush();
    fail = 'NETWORK';
    await service.send();
    expect(service.error()).toBe('sharedFailed');
    const first = rpc.mock.calls.find(([name]) => name === 'test_event_notifications')![1];
    fail = '';
    await service.send();
    const sends = rpc.mock.calls.filter(([name]) => name === 'test_event_notifications');
    expect(sends[1][1]).toEqual(first);
    expect(service.devices()).toBe(3);
    await service.send();
    expect(rpc.mock.calls.filter(([name]) => name === 'test_event_notifications')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60000);
    await service.send();
    expect(rpc.mock.calls.filter(([name]) => name === 'test_event_notifications')).toHaveLength(3);
    expect(
      rpc.mock.calls.filter(([name]) => name === 'test_event_notifications')[2][1],
    ).not.toEqual(first);
  });
  it('handles server cooldown without reporting queued delivery', async () => {
    profile.set({ system_role: 'OWNER', roles: [] });
    await flush();
    fail = 'TEST_RATE_LIMITED';
    await service.send();
    expect(service.devices()).toBeNull();
    expect(service.cooling()).toBe(true);
    expect(service.error()).toBe('sharedLimit');
  });
  it('does not send twice while the first request is awaiting confirmation', async () => {
    profile.set({ system_role: 'OWNER', roles: [] });
    await flush();
    let resolve!: (value: unknown) => void;
    pending = new Promise((done) => (resolve = done));
    const first = service.send();
    await service.send();
    expect(rpc.mock.calls.filter(([name]) => name === 'test_event_notifications')).toHaveLength(1);
    resolve({ devices: 0 });
    await first;
    expect(service.devices()).toBe(0);
  });
});
