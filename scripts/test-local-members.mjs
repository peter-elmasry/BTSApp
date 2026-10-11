import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEdgeHandler } from './edge-handler-harness.mjs';

// Execute the actual Edge handler against local GoTrue/PostgREST. Never target
// a hosted project; fixture credentials stay in memory and are never printed.
export async function verifyLocalMembers(url, anonKey, serviceKey, ownerJwt) {
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname),
    'member integration requires localhost',
  );
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceKey, options);
  const { handler } = loadEdgeHandler('members', createClient, {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const firstPassword = `fixture-${randomUUID()}`;
  const secondPassword = `fixture-${randomUUID()}`;
  let memberId;
  let authId;
  async function invoke(body) {
    const response = await handler(
      new Request(`${url}/functions/v1/members`, {
        method: 'POST',
        headers: { authorization: `Bearer ${ownerJwt}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const result = await response.json();
    assert.equal(response.status, 200, `member ${body.action} must succeed`);
    assert.equal(result.ok, true, `member ${body.action} must be fully recorded`);
    return result;
  }
  async function signIn(password, allowed) {
    const client = createClient(url, anonKey, options);
    const { data, error } = await client.auth.signInWithPassword({
      email: `m-${memberId}@members.dst-bts.app`,
      password,
    });
    assert.equal(!error && !!data.session, allowed, 'Auth account state must match the operation');
    if (data.session) await client.auth.signOut();
  }
  try {
    memberId = (
      await invoke({
        action: 'create',
        username: `audit_${suffix}`,
        full_name_en: 'Synthetic audit member',
      })
    ).member_id;
    await invoke({
      action: 'update',
      member_id: memberId,
      full_name_en: 'Updated synthetic audit member',
    });
    await invoke({ action: 'set_password', member_id: memberId, password: firstPassword });
    const { data: member, error: memberError } = await admin
      .from('members')
      .select('auth_user_id,full_name_en')
      .eq('id', memberId)
      .single();
    assert.equal(memberError, null);
    authId = member.auth_user_id;
    assert.ok(authId);
    assert.equal(member.full_name_en, 'Updated synthetic audit member');
    await signIn(firstPassword, true);
    await invoke({ action: 'deactivate', member_id: memberId });
    await signIn(firstPassword, false);
    await invoke({ action: 'reactivate', member_id: memberId });
    await signIn(firstPassword, true);
    await invoke({ action: 'set_password', member_id: memberId, password: secondPassword });
    await signIn(firstPassword, false);
    await signIn(secondPassword, true);
    const { data: operations, error: operationsError } = await admin
      .from('member_admin_operations')
      .select('status,action')
      .eq('member_id', memberId);
    assert.equal(operationsError, null);
    assert.equal(operations.length, 4);
    assert.ok(operations.every((operation) => operation.status === 'SUCCEEDED'));
    const { data: audit, error: auditError } = await admin
      .from('audit_log')
      .select('action,before,after')
      .eq('entity_id', memberId);
    assert.equal(auditError, null);
    for (const action of [
      'MEMBER_CREATED',
      'MEMBER_UPDATED',
      'MEMBER_LOGIN_LINKED',
      'MEMBER_DEACTIVATED',
      'MEMBER_REACTIVATED',
      'MEMBER_PASSWORD_SET',
    ]) {
      assert.ok(
        audit.some((row) => row.action === action),
        `${action} audit exists`,
      );
    }
    assert.equal(audit.filter((row) => row.action === 'MEMBER_AUTH_REQUESTED').length, 4);
    const serialized = JSON.stringify(audit);
    assert.equal(
      serialized.includes(firstPassword) || serialized.includes(secondPassword),
      false,
      'audit excludes credentials',
    );
    console.log(
      'Local member/Auth integration passed: create, edit, login enablement, deactivate, reactivate, password reset and durable audit.',
    );
  } finally {
    // Fixture teardown only; preserve its credential-free audit trail.
    if (!authId && memberId) {
      const { data } = await admin
        .from('members')
        .select('auth_user_id')
        .eq('id', memberId)
        .maybeSingle();
      authId = data?.auth_user_id;
    }
    if (authId) {
      const { error } = await admin.auth.admin.deleteUser(authId);
      assert.equal(error, null, 'remove synthetic Auth fixture');
    }
    if (memberId) {
      const { error } = await admin.from('members').delete().eq('id', memberId);
      assert.equal(error, null, 'remove synthetic member fixture');
    }
  }
}
