import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEdgeHandler } from './edge-handler-harness.mjs';

export async function verifyLocalLogin(url, anonKey, serviceKey) {
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Login integration is restricted to localhost');
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checked = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  const id = randomUUID();
  const username = `login_${randomBytes(6).toString('hex')}`;
  const phone = `+201${String(BigInt('0x' + randomBytes(5).toString('hex')) % 1000000000n).padStart(9, '0')}`;
  const password = randomBytes(24).toString('base64url');
  let userId;
  const { handler } = loadEdgeHandler('login', createClient, {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  });
  const login = (identifier, secret = password) =>
    handler(
      new Request(`${url}/functions/v1/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password: secret }),
      }),
    );
  try {
    checked(
      await admin.from('members').insert({ id, username, phone, full_name_en: 'Login test' }),
    );
    const created = checked(
      await admin.auth.admin.createUser({
        email: `m-${id}@members.dst-bts.app`,
        password,
        email_confirm: true,
      }),
    );
    userId = created.user.id;
    checked(await admin.from('members').update({ auth_user_id: userId }).eq('id', id));
    for (const identifier of [username.toUpperCase(), `0${phone.slice(3)}`]) {
      const response = await login(identifier);
      assert.equal(response.status, 200, 'username/normalized phone login');
      const tokens = await response.json();
      assert.equal(checked(await admin.auth.getUser(tokens.access_token)).user.id, userId);
    }
    checked(await admin.from('members').update({ is_active: false }).eq('id', id));
    assert.equal((await login(username)).status, 401, 'inactive member rejected');
    checked(await admin.from('members').update({ is_active: true }).eq('id', id));
    checked(await admin.from('login_attempts').delete().eq('identifier', username));
    for (let n = 0; n < 5; n++)
      assert.equal((await login(username, randomBytes(16).toString('hex'))).status, 401);
    assert.equal((await login(username)).status, 429, 'correct password also blocked');
    const lock = checked(
      await admin.from('login_limits').select('locked_until').eq('identifier', username).single(),
    );
    assert.ok(Date.parse(lock.locked_until) > Date.now() + 9 * 60_000, 'full deadline persisted');
    checked(
      await admin
        .from('login_attempts')
        .update({ attempted_at: new Date(Date.now() - 11 * 60_000).toISOString() })
        .eq('identifier', username),
    );
    assert.equal((await login(username)).status, 429, 'aged-out history cannot release lock');
    checked(
      await admin
        .from('login_limits')
        .update({ locked_until: new Date(Date.now() - 1000).toISOString() })
        .eq('identifier', username),
    );
    assert.equal((await login(username)).status, 200, 'login recovers after deadline');

    // Exercise real concurrent transactions, not a JavaScript model of SQL locks.
    checked(await admin.from('login_attempts').delete().eq('identifier', username));
    checked(
      await admin.from('login_limits').update({ locked_until: null }).eq('identifier', username),
    );
    checked(
      await admin
        .from('login_attempts')
        .insert(Array.from({ length: 4 }, () => ({ identifier: username, success: false }))),
    );
    const admissions = await Promise.all(
      Array.from({ length: 12 }, async () =>
        checked(await admin.rpc('begin_login_attempt', { p_identifier: username })),
      ),
    );
    assert.equal(admissions.filter((item) => item.status === 'allowed').length, 1);
    assert.equal(admissions.filter((item) => item.status === 'busy').length, 11);
    const attempt = admissions.find((item) => item.status === 'allowed').attempt_id;
    const completions = await Promise.all(
      Array.from({ length: 8 }, async () =>
        checked(await admin.rpc('finish_login_attempt', { p_attempt: attempt, p_success: false })),
      ),
    );
    assert.equal(completions.filter(Boolean).length, 1, 'completion replay records only once');
    assert.equal((await login(username)).status, 429);
    console.log(
      'Local login handler: username/phone, inactive account, full lockout, expiry and concurrent admission/completion passed.',
    );
  } finally {
    checked(await admin.from('login_limits').delete().in('identifier', [username, phone]));
    checked(await admin.from('login_attempts').delete().in('identifier', [username, phone]));
    if (userId) checked(await admin.auth.admin.deleteUser(userId));
    checked(await admin.from('members').delete().eq('id', id));
  }
}
