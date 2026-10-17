import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, Subject } from 'rxjs';
import { EventStore } from '../player/event.store';
import { DirectionService } from '../i18n/i18n.service';
import { RoundPushService } from './round-push.service';
import { PUSH_DEVICE_KEY, readPushDevice, revokePushDevice } from './round-push-api';

describe('opt-in round notifications', () => {
  const publicKey = 'B'.repeat(87);
  const event = signal({ id: 'event-one', name_en: 'Event one', name_ar: 'الحدث الأول' });
  const language = signal<'en' | 'ar'>('en');
  let subscriptions: BehaviorSubject<PushSubscription | null>;
  let changes: Subject<unknown>;
  let requestPermission: ReturnType<typeof vi.fn>;
  let requestSubscription: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let requests: Record<string, unknown>[];
  let fail: string;
  let service: RoundPushService;
  const subscription = {
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fixture',
      keys: { p256dh: publicKey, auth: 'A'.repeat(22) },
    }),
    options: {},
  } as unknown as PushSubscription;
  const settle = async () => {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
      TestBed.tick();
    }
  };
  beforeEach(() => {
    localStorage.clear();
    requests = [];
    fail = '';
    event.set({ id: 'event-one', name_en: 'Event one', name_ar: 'الحدث الأول' });
    language.set('en');
    subscriptions = new BehaviorSubject<PushSubscription | null>(null);
    changes = new Subject();
    requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('isSecureContext', true);
    requestSubscription = vi.fn(async () => {
      subscriptions.next(subscription);
      return subscription;
    });
    unsubscribe = vi.fn(async () => {
      subscriptions.next(null);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        requests.push(body);
        return {
          ok: body.action !== fail,
          json: async () =>
            body.action === fail
              ? { error: fail === 'test' ? 'TEST_RATE_LIMITED' : 'PUSH_UNAVAILABLE' }
              : body.action === 'config'
                ? { publicKey }
                : { ok: true },
        };
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwPush,
          useValue: {
            isEnabled: true,
            subscription: subscriptions,
            pushSubscriptionChanges: changes,
            requestSubscription,
            unsubscribe,
          },
        },
        { provide: EventStore, useValue: { event } },
        { provide: DirectionService, useValue: { language } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  async function start() {
    service = TestBed.inject(RoundPushService);
    await settle();
    return service;
  }
  it('loads public capability without asking permission or subscribing automatically', async () => {
    await start();
    expect(service.ready()).toBe(true);
    expect(service.enabled()).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(requestSubscription).not.toHaveBeenCalled();
    expect(requests.map((r) => r['action'])).toEqual(['config']);
  });
  it('requires a gesture and server acknowledgment, and keeps a safe receipt for failed-save retry', async () => {
    await start();
    fail = 'subscribe';
    await service.enable();
    expect(service.enabled()).toBe(false);
    expect(service.notice()).toBe('');
    expect(service.error()).toBe('saveFailed');
    const receipt = readPushDevice()!.receipt;
    expect(readPushDevice()!.event).toBe('');
    fail = '';
    await service.enable();
    expect(service.enabled()).toBe(true);
    expect(service.notice()).toBe('saved');
    expect(readPushDevice()!.receipt).toBe(receipt);
    expect(requests.filter((r) => r['action'] === 'subscribe')).toHaveLength(2);
  });
  it('denied or dismissed permission never registers an endpoint', async () => {
    await start();
    requestPermission.mockResolvedValueOnce('denied');
    await service.enable();
    expect(service.error()).toBe('denied');
    expect(requestSubscription).not.toHaveBeenCalled();
    requestPermission.mockResolvedValueOnce('default');
    await service.enable();
    expect(service.error()).toBe('dismissed');
  });
  it('does not report an old event as enabled after changing the current event', async () => {
    await start();
    await service.enable();
    event.set({ id: 'event-two', name_en: 'Second', name_ar: 'الثاني' });
    await settle();
    expect(service.enabled()).toBe(false);
    expect(requests.filter((r) => r['action'] === 'subscribe')).toHaveLength(1);
    await service.enable();
    expect(service.enabled()).toBe(true);
    expect(readPushDevice()!.event).toBe('event-two');
  });
  it('restores a previously consented endpoint only for the same event and language', async () => {
    localStorage.setItem(
      PUSH_DEVICE_KEY,
      JSON.stringify({ receipt: 'a'.repeat(64), event: 'event-one', publicKey }),
    );
    subscriptions.next(subscription);
    (Notification as unknown as { permission: string }).permission = 'granted';
    await start();
    expect(service.enabled()).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    language.set('ar');
    await settle();
    expect(requests.at(-1)!['language']).toBe('ar');
    expect(service.eventName()).toBe('الحدث الأول');
  });
  it('does not falsely confirm disable when both revocation mechanisms fail', async () => {
    await start();
    await service.enable();
    fail = 'unsubscribe';
    unsubscribe.mockRejectedValueOnce(new Error('Browser failure'));
    await service.disable();
    expect(service.error()).toBe('removeFailed');
    expect(service.enabled()).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    fail = '';
    await service.disable();
    expect(service.enabled()).toBe(false);
    expect(readPushDevice()).toBeNull();
    expect(service.notice()).toBe('disabled');
  });
  it('can disable locally while offline without waiting for server cleanup', async () => {
    await start();
    await service.enable();
    fail = 'unsubscribe';
    await service.disable();
    expect(service.enabled()).toBe(false);
    expect(readPushDevice()).toBeNull();
    expect(service.notice()).toBe('disabled');
  });
  it('does not resurrect a receipt when logout races an in-flight enable', async () => {
    await start();
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((done) => (resolve = done))),
    );
    const enabling = service.enable();
    await settle();
    window.dispatchEvent(new Event('bts:push-revoked'));
    localStorage.removeItem(PUSH_DEVICE_KEY);
    resolve({ ok: true, json: async () => ({ ok: true }) });
    await enabling;
    expect(readPushDevice()).toBeNull();
    expect(service.enabled()).toBe(false);
    expect(service.notice()).toBe('');
  });
  it('can revoke a server receipt whose browser subscription already vanished', async () => {
    await start();
    await service.enable();
    subscriptions.next(null);
    await service.disable();
    expect(service.error()).toBe('');
    expect(readPushDevice()).toBeNull();
  });
  it('labels a test as queued and handles device rate limits without claiming delivery', async () => {
    await start();
    await service.enable();
    await service.test();
    expect(service.notice()).toBe('testQueued');
    fail = 'test';
    await service.test();
    expect(service.notice()).toBe('');
    expect(service.error()).toBe('testLimit');
  });
  it('ignores duplicate enable taps while permission is pending', async () => {
    await start();
    let resolve!: (value: string) => void;
    requestPermission.mockReturnValue(new Promise((done) => (resolve = done)));
    const first = service.enable();
    await service.enable();
    resolve('granted');
    await first;
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(requests.filter((r) => r['action'] === 'subscribe')).toHaveLength(1);
  });
  it('does not claim readiness if the backend is not configured', async () => {
    fail = 'config';
    await start();
    expect(service.ready()).toBe(false);
    expect(service.error()).toBe('notReady');
    await service.enable();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('clears displayed device state when logout revokes the endpoint', async () => {
    await start();
    await service.enable();
    await revokePushDevice();
    expect(service.enabled()).toBe(false);
    expect(service.hasDevice()).toBe(false);
    expect(requests.at(-1)!['action']).toBe('unsubscribe');
  });
});
