import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

function validSubscription(value: any): boolean {
  try {
    const url = new URL(value.endpoint);
    return (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      value.endpoint.length <= 2048 &&
      url.pathname.length > 1 &&
      /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(
        url.hostname,
      ) &&
      /^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh ?? '') &&
      /^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth ?? '')
    );
  } catch {
    return false;
  }
}

function payload(job: any, origin: string) {
  const ar = job.language === 'ar';
  return JSON.stringify({
    notification: {
      title: String(job.eventName).slice(0, 120),
      body:
        job.cue === 'test'
          ? ar
            ? 'إشعارات الجولات تعمل على هذا الجهاز.'
            : 'Round notifications work on this device.'
          : ar
            ? `${job.cue === 'round-start' ? 'بدأت' : 'انتهت'} الجولة ${job.roundNumber}`
            : `Round ${job.roundNumber} ${job.cue === 'round-start' ? 'started' : 'ended'}`,
      icon: `${origin}/brand/icon-192.png`,
      tag: `round-${job.occurrence}`,
      data: {
        btsRoundPush: true,
        test: job.cue === 'test',
        expiresAt: job.expiresAt,
        url: `${origin}/home`,
      },
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    if (Number(request.headers.get('content-length')) > 12000)
      return json({ error: 'INVALID_REQUEST' }, 400);
    const raw = await request.text();
    if (raw.length > 12000) return json({ error: 'INVALID_REQUEST' }, 400);
    const body = JSON.parse(raw);
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const rpc = async (name: string, args = {}) => {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error('PUSH_UNAVAILABLE');
      return data;
    };
    const config = await rpc('round_push_config');
    if (!config) return json({ error: 'NOT_CONFIGURED' }, 503);
    if (body.action === 'config') return json({ publicKey: config.publicKey });
    if (body.action === 'dispatch') {
      // Constant-sized digests avoid comparing secret text with early-exit string equality.
      const actual = await digest(request.headers.get('x-push-secret') ?? '');
      const expected = await digest(config.dispatchSecret);
      let difference = 0;
      for (let i = 0; i < expected.length; i++)
        difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
      if (difference !== 0) return json({ error: 'FORBIDDEN' }, 403);
      const jobs = await rpc('claim_round_push', { p_limit: 100 });
      for (let start = 0; start < jobs.length; start += 10) {
        await Promise.all(
          jobs.slice(start, start + 10).map(async (job: any) => {
            let status = 400;
            if (validSubscription(job.subscription) && Date.parse(job.expiresAt) > Date.now()) {
              try {
                const result = await webpush.sendNotification(
                  job.subscription,
                  payload(job, config.origin),
                  {
                    vapidDetails: {
                      subject: config.subject,
                      publicKey: config.publicKey,
                      privateKey: config.privateKey,
                    },
                    TTL: Math.max(
                      1,
                      Math.min(120, Math.floor((Date.parse(job.expiresAt) - Date.now()) / 1000)),
                    ),
                    urgency: 'high',
                    timeout: 5000,
                  },
                );
                status = result.statusCode;
              } catch (error) {
                status = Number((error as { statusCode?: number }).statusCode) || 503;
              }
            }
            await rpc('finish_round_push', { p_id: job.id, p_lease: job.lease, p_status: status });
          }),
        );
      }
      // Drain larger audiences through bounded invocations, without waiting for the next minute.
      await rpc('wake_round_push');
      return json({ processed: jobs.length });
    }
    if (
      !['subscribe', 'unsubscribe', 'test'].includes(body.action) ||
      !/^[a-f0-9]{64}$/.test(body.receipt ?? '')
    )
      return json({ error: 'INVALID_REQUEST' }, 400);
    const receipt = await digest(body.receipt);
    // Salted addresses are short-lived counters, never stored as raw IPs.
    const address = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown';
    if (body.action === 'subscribe') {
      const admitted = await rpc('round_push_admit', {
        p_bucket: await digest(`${config.dispatchSecret}:${address}`),
      });
      if (!admitted) return json({ error: 'RATE_LIMITED' }, 429);
    }
    if (body.action === 'subscribe') {
      if (
        !/^[a-f0-9-]{36}$/i.test(body.event ?? '') ||
        !['ar', 'en'].includes(body.language) ||
        !validSubscription(body.subscription)
      )
        return json({ error: 'INVALID_SUBSCRIPTION' }, 400);
      await rpc('save_round_push', {
        p_receipt: receipt,
        p_event: body.event,
        p_subscription: body.subscription,
        p_language: body.language,
      });
    } else if (body.action === 'unsubscribe') {
      await rpc('remove_round_push', { p_receipt: receipt });
    } else if (!(await rpc('test_round_push', { p_receipt: receipt }))) {
      return json({ error: 'TEST_RATE_LIMITED' }, 429);
    }
    return json({ ok: true });
  } catch {
    return json({ error: 'PUSH_UNAVAILABLE' }, 503);
  }
});
