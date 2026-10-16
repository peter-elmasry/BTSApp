import { createECDH, randomBytes } from 'node:crypto';

// Production release helper: secrets stay in process memory and Supabase Vault.
// Re-running preserves the VAPID identity so installed devices remain subscribed.
const ref = process.env.SUPABASE_PROJECT_REF;
const projectUrl = process.env.SUPABASE_URL || (ref && `https://${ref}.supabase.co`);
const origin = process.env.PUSH_APP_ORIGIN;
if (!projectUrl || !origin || !/^https:\/\/[a-zA-Z0-9.-]+$/.test(origin))
  throw new Error('Set SUPABASE_URL (or SUPABASE_PROJECT_REF) and PUSH_APP_ORIGIN.');
let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key && ref && process.env.SUPABASE_ACCESS_TOKEN) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!response.ok) throw new Error('Unable to obtain the deployment service credential.');
  const keys = await response.json();
  key = keys.find((item) => item.name === 'service_role')?.api_key;
}
if (!key)
  throw new Error('Provide a service role key or the existing Supabase deployment credentials.');
async function rpc(name, body = {}) {
  const response = await fetch(`${projectUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  // Never include the response body in errors; configuration contains private keys.
  if (!response.ok) throw new Error(`Push configuration RPC failed (${response.status}).`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const existing = await rpc('round_push_config');
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const config = {
  ...(existing || {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: Buffer.concat([Buffer.alloc(32), ecdh.getPrivateKey()])
      .subarray(-32)
      .toString('base64url'),
    dispatchSecret: randomBytes(32).toString('hex'),
  }),
  origin,
  functionUrl: `${projectUrl}/functions/v1/round-push`,
  subject: process.env.PUSH_VAPID_SUBJECT || existing?.subject || origin,
};
await rpc('configure_round_push', { p_config: config });
// Public endpoint confirms both deployment and configuration without sending an alert.
const ready = await fetch(config.functionUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'config' }),
});
if (!ready.ok || (await ready.json()).publicKey !== config.publicKey)
  throw new Error('Push function readiness check failed.');
console.log('Background round notifications configured; existing device identity preserved.');
