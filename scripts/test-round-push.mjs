import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadEdgeHandler } from './edge-handler-harness.mjs';

const config = {
  publicKey: 'B'.repeat(87),
  privateKey: 'P'.repeat(43),
  dispatchSecret: 'd'.repeat(64),
  origin: 'https://app.example',
  subject: 'https://app.example',
};
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
};
const job = {
  id: 'job',
  lease: 'lease',
  occurrence: 'cue',
  cue: 'round-start',
  language: 'en',
  roundNumber: 2,
  eventName: 'Event',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  subscription,
};
function fixture(options = {}) {
  const calls = [];
  const sends = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (options.fail === name) return { error: { message: 'private-error-must-not-escape' } };
    const data =
      name === 'round_push_config'
        ? options.unconfigured
          ? null
          : config
        : name === 'round_push_admit'
          ? !options.rateLimited
          : name === 'test_round_push'
            ? !options.testLimited
            : name === 'claim_round_push'
              ? (options.jobs ?? [job])
              : null;
    return { data, error: null };
  };
  const webpush = {
    sendNotification: async (...args) => {
      sends.push(args);
      if (options.providerStatus) throw { statusCode: options.providerStatus };
      return { statusCode: 201 };
    },
  };
  const { handler } = loadEdgeHandler('round-push', () => ({ rpc }), {}, { webpush });
  return { handler, calls, sends };
}
const request = (body, secret) =>
  new Request('https://edge.example/round-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-push-secret': secret } : {}) },
    body: JSON.stringify(body),
  });
const subscribe = {
  action: 'subscribe',
  receipt: 'a'.repeat(64),
  event: '30000031-0000-0000-0000-000000000001',
  language: 'en',
  subscription,
};
let checks = 0;
async function check(name, run) {
  await run();
  checks++;
  console.log(`ok - ${name}`);
}
await check('public configuration never returns runtime secrets', async () => {
  const f = fixture();
  const response = await f.handler(request({ action: 'config' }));
  assert.deepEqual(await response.json(), { publicKey: config.publicKey });
  assert.equal(f.sends.length, 0);
  assert.equal(
    (await fixture({ unconfigured: true }).handler(request({ action: 'config' }))).status,
    503,
  );
});
await check('dispatch requires its independent secret; guest requests cannot send', async () => {
  for (const secret of [undefined, 'wrong', config.dispatchSecret.slice(1)]) {
    const f = fixture();
    assert.equal((await f.handler(request({ action: 'dispatch' }, secret))).status, 403);
    assert.equal(f.sends.length, 0);
    assert.equal(f.calls.length, 1);
  }
});
await check('subscriptions use hashed receipts and private, salted admission buckets', async () => {
  const f = fixture();
  assert.equal((await f.handler(request(subscribe))).status, 200);
  const save = f.calls.find((call) => call.name === 'save_round_push').args;
  assert.match(save.p_receipt, /^[a-f0-9]{64}$/);
  assert.notEqual(save.p_receipt, subscribe.receipt);
  assert.equal(save.p_event, subscribe.event);
  assert.equal(save.p_language, 'en');
  assert.match(
    f.calls.find((call) => call.name === 'round_push_admit').args.p_bucket,
    /^[a-f0-9]{64}$/,
  );
});
await check(
  'endpoint validation blocks SSRF, credentials, deceptive hostnames and bad keys',
  async () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/path',
      'https://127.0.0.1/private',
      'https://fcm.googleapis.com.attacker.test/path',
      'https://user@fcm.googleapis.com/path',
      'https://fcm.googleapis.com:8443/path',
      'https://web.push.apple.com/path#fragment',
    ]) {
      const f = fixture();
      const response = await f.handler(
        request({ ...subscribe, subscription: { ...subscription, endpoint } }),
      );
      assert.equal(response.status, 400, endpoint);
      assert.ok(!f.calls.some((call) => call.name === 'save_round_push'));
    }
    const f = fixture();
    assert.equal(
      (await f.handler(request({ ...subscribe, subscription: { ...subscription, keys: {} } })))
        .status,
      400,
    );
  },
);
await check('shared-address registration limits do not block device revocation', async () => {
  const f = fixture({ rateLimited: true });
  assert.equal((await f.handler(request(subscribe))).status, 429);
  assert.equal(
    (await f.handler(request({ action: 'unsubscribe', receipt: subscribe.receipt }))).status,
    200,
  );
});
await check('test limits and server failures do not claim success or reveal errors', async () => {
  assert.equal(
    (
      await fixture({ testLimited: true }).handler(
        request({ action: 'test', receipt: subscribe.receipt }),
      )
    ).status,
    429,
  );
  const f = fixture({ fail: 'save_round_push' });
  const response = await f.handler(request(subscribe));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'PUSH_UNAVAILABLE' });
});
await check('delivery is bounded, contains no results, and drains pending batches', async () => {
  const f = fixture();
  assert.equal(
    (await f.handler(request({ action: 'dispatch' }, config.dispatchSecret))).status,
    200,
  );
  assert.equal(f.sends.length, 1);
  const notification = JSON.parse(f.sends[0][1]).notification;
  assert.equal(notification.body, 'Round 2 started');
  assert.equal(notification.data.btsRoundPush, true);
  assert.equal(notification.data.url, `${config.origin}/home`);
  assert.doesNotMatch(f.sends[0][1], /outcome|participants|receipt|privateKey|dispatchSecret/);
  assert.equal(f.sends[0][2].timeout, 5000);
  assert.ok(f.sends[0][2].TTL <= 60);
  assert.equal(f.calls.find((call) => call.name === 'finish_round_push').args.p_status, 201);
  assert.equal(f.calls.at(-1).name, 'wake_round_push');
});
await check(
  'expired jobs are never sent; provider expiry and throttling reach the queue',
  async () => {
    const expired = fixture({ jobs: [{ ...job, expiresAt: '2000-01-01T00:00:00Z' }] });
    await expired.handler(request({ action: 'dispatch' }, config.dispatchSecret));
    assert.equal(expired.sends.length, 0);
    for (const status of [404, 410, 429, 503]) {
      const f = fixture({ providerStatus: status });
      await f.handler(request({ action: 'dispatch' }, config.dispatchSecret));
      assert.equal(f.calls.find((call) => call.name === 'finish_round_push').args.p_status, status);
    }
  },
);
await check('Arabic end and test notifications are localized', async () => {
  for (const cue of ['round-end', 'test']) {
    const f = fixture({ jobs: [{ ...job, language: 'ar', cue }] });
    await f.handler(request({ action: 'dispatch' }, config.dispatchSecret));
    const n = JSON.parse(f.sends[0][1]).notification;
    assert.match(n.body, cue === 'test' ? /إشعارات/ : /انتهت الجولة 2/);
    assert.equal(n.data.test, cue === 'test');
  }
});

function worker(visible = false) {
  const handlers = {};
  const shown = [];
  const opened = [];
  const navigated = [];
  const self = {
    location: { origin: config.origin },
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: {
      matchAll: async () =>
        visible === null
          ? []
          : [
              {
                url: config.origin + '/home',
                visibilityState: visible ? 'visible' : 'hidden',
                navigate: async (url) => navigated.push(url),
                focus: async () => {},
              },
            ],
      openWindow: async (url) => opened.push(url),
    },
  };
  vm.runInNewContext(readFileSync('public/push-worker.js', 'utf8'), {
    self,
    URL,
    importScripts: (url) => assert.equal(url, './ngsw-worker.js'),
  });
  async function push(data, options = {}) {
    let stopped = false;
    let work;
    handlers.push({
      data: {
        json: () => ({
          notification: {
            title: 'Event',
            data: { btsRoundPush: true, expiresAt: job.expiresAt, ...data },
            ...options,
          },
        }),
      },
      stopImmediatePropagation: () => (stopped = true),
      waitUntil: (promise) => (work = promise),
    });
    await work;
    return stopped;
  }
  async function click() {
    let work;
    handlers.notificationclick({
      notification: { data: { btsRoundPush: true, url: 'https://attacker.test' }, close: () => {} },
      stopImmediatePropagation() {},
      waitUntil: (promise) => (work = promise),
    });
    await work;
  }
  return { shown, opened, navigated, push, click };
}
await check(
  'real worker suppresses ordinary foreground alerts but displays explicit tests',
  async () => {
    const w = worker(true);
    assert.equal(await w.push({}), true);
    assert.equal(w.shown.length, 0);
    await w.push({ test: true });
    assert.equal(w.shown.length, 1);
  },
);
await check('real worker handles hidden/closed windows and ignores stale messages', async () => {
  for (const visibility of [false, null]) {
    const w = worker(visibility);
    await w.push({});
    assert.equal(w.shown.length, 1);
    await w.push({ expiresAt: '2000-01-01T00:00:00Z' });
    assert.equal(w.shown.length, 1);
  }
});
await check('notification click uses a fixed same-origin Home destination', async () => {
  const closed = worker(null);
  await closed.click();
  assert.deepEqual(closed.opened, [config.origin + '/home']);
  const hidden = worker(false);
  await hidden.click();
  assert.deepEqual(hidden.navigated, [config.origin + '/home']);
});
console.log(`${checks} push Edge/worker checks passed.`);

await check(
  'deployment helper provisions valid keys once and preserves them on later releases',
  async () => {
    const names = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'PUSH_APP_ORIGIN',
      'PUSH_VAPID_SUBJECT',
    ];
    const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const beforeFetch = globalThis.fetch;
    let stored = null;
    let saves = 0;
    try {
      process.env.SUPABASE_URL = 'https://fixture.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-key';
      process.env.PUSH_APP_ORIGIN = config.origin;
      delete process.env.PUSH_VAPID_SUBJECT;
      globalThis.fetch = async (url, options) => {
        if (url.endsWith('/rest/v1/http_request_queue')) {
          assert.equal(options.headers['Accept-Profile'], 'net');
          return Response.json({ code: 'PGRST106' }, { status: 406 });
        }
        if (url.endsWith('/rpc/round_push_config')) return Response.json(stored);
        if (url.endsWith('/rpc/configure_round_push')) {
          stored = JSON.parse(options.body).p_config;
          saves++;
          return new Response(null, { status: 204 });
        }
        assert.equal(url, 'https://fixture.supabase.co/functions/v1/round-push');
        return Response.json({ publicKey: stored.publicKey });
      };
      await import('./configure-round-push.mjs?test=first');
      assert.match(stored.publicKey, /^[A-Za-z0-9_-]{87}$/);
      assert.match(stored.privateKey, /^[A-Za-z0-9_-]{43}$/);
      assert.match(stored.dispatchSecret, /^[a-f0-9]{64}$/);
      const first = { ...stored };
      await import('./configure-round-push.mjs?test=second');
      assert.deepEqual(stored, first);
      assert.equal(saves, 2);
    } finally {
      globalThis.fetch = beforeFetch;
      for (const name of names)
        if (before[name] === undefined) delete process.env[name];
        else process.env[name] = before[name];
    }
  },
);
