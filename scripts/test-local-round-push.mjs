import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createECDH, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const values = {};
if (!process.env.SUPABASE_ENV_FILE) throw new Error('Local Supabase status file required.');
for (const line of (await readFile(process.env.SUPABASE_ENV_FILE, 'utf8')).split('\n')) {
  const match = line.trim().match(/^([A-Z_]+)="(.*)"$/);
  if (match) values[match[1]] = match[2];
}
const url = values.API_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error('Push integration is restricted to localhost.');
const client = createClient(url, values.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const functionUrl = `${url}/functions/v1/round-push`;
const request = (action, secret) =>
  fetch(functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-push-secret': secret } : {}) },
    body: JSON.stringify({ action }),
    signal: AbortSignal.timeout(10000),
  });
let responding = false;
for (let attempt = 0; attempt < 15; attempt++) {
  try {
    const response = await request('config');
    if (response.status === 503 && (await response.json()).error === 'NOT_CONFIGURED') {
      responding = true;
      break;
    }
  } catch {
    /* Runtime may still be loading npm dependencies. */
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(responding, 'Actual Edge runtime must load web-push and return the unconfigured state.');
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const config = {
  publicKey: ecdh.getPublicKey().toString('base64url'),
  privateKey: Buffer.concat([Buffer.alloc(32), ecdh.getPrivateKey()])
    .subarray(-32)
    .toString('base64url'),
  dispatchSecret: randomBytes(32).toString('hex'),
  origin: 'https://push-fixture.example',
  subject: 'https://push-fixture.example',
  functionUrl: 'https://fixture.supabase.co/functions/v1/round-push',
};
const configured = await client.rpc('configure_round_push', { p_config: config });
assert.ok(!configured.error, 'Service role can configure Vault through its protected RPC.');
const ready = await request('config');
assert.equal(ready.status, 200);
assert.deepEqual(await ready.json(), { publicKey: config.publicKey });
assert.equal((await request('dispatch', 'invalid-fixture')).status, 403);
const dispatched = await request('dispatch', config.dispatchSecret);
assert.equal(dispatched.status, 200);
assert.deepEqual(await dispatched.json(), { processed: 0 });
assert.equal((await fetch(functionUrl)).status, 405);
console.log(
  'Actual local Edge runtime: Web Push imports, Vault configuration/public key, dispatch authentication, empty queue and method checks passed. No provider sends attempted.',
);
