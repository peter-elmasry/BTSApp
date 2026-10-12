import assert from 'node:assert/strict';
import { loadEdgeHandler } from './edge-handler-harness.mjs';

const memberId = '29000000-0000-0000-0000-000000000002';
const actorId = '19000000-0000-0000-0000-000000000001';
const authId = '19000000-0000-0000-0000-000000000002';
let passed = 0;
function fixture(options = {}) {
  const calls = [];
  const intents = new Map();
  const writes = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: options.userId ?? actorId } } }),
      admin: {
        async createUser(args) {
          calls.push(['auth.create', args]);
          if (options.authThrow) throw new Error('Synthetic transport failure');
          return {
            data: { user: options.authError ? null : { id: authId } },
            error: options.authError ? {} : null,
          };
        },
        async updateUserById(id, args) {
          calls.push(['auth.update', { id, ...args }]);
          if (options.authThrow) throw new Error('Synthetic transport failure');
          return { error: options.authError ? {} : null };
        },
      },
    },
    from(table) {
      assert.equal(table, 'members', 'handler must never write members/audit directly');
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({
          data: {
            id: memberId,
            auth_user_id: options.noLogin ? null : (options.userId ?? authId),
            username: 'fixture_guide',
            is_active: options.active !== false,
          },
        }),
      };
    },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'is_owner') return { data: options.owner !== false };
      assert.equal(
        JSON.stringify(args).includes('fixture-password'),
        false,
        'credentials never reach an audit/database RPC',
      );
      if (name === 'member_admin_write') {
        if (options.failWrite === args.p_action) return { error: { code: 'P0001' } };
        writes.push(args.p_action);
        return { data: { id: args.p_member } };
      }
      if (name === 'member_admin_begin') {
        if (options.failIntent) return { error: {} };
        if (options.existingIntent)
          return { data: { id: 'existing-operation', status: 'NEEDS_REVIEW' } };
        intents.set(args.p_op_id, 'STARTED');
        return { data: { id: args.p_op_id, status: 'STARTED' } };
      }
      if (name === 'member_admin_finish') {
        if (options.failFinish) return { error: {} };
        intents.set(args.p_op_id, args.p_status);
        return { error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const { handler } = loadEdgeHandler('members', () => client);
  return {
    calls,
    intents,
    writes,
    async request(action, extra = {}) {
      const response = await handler(
        new Request('https://fixture.invalid/members', {
          method: 'POST',
          headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
          body: JSON.stringify({
            action,
            member_id: memberId,
            username: 'fixture_guide',
            full_name_en: 'Fixture Guide',
            ...extra,
          }),
        }),
      );
      return { response, body: await response.json() };
    },
  };
}
async function check(name, callback) {
  await callback();
  passed++;
  console.log(`PASS ${name}`);
}
const password = 'fixture-password-only';
for (const action of ['create', 'update', 'deactivate', 'reactivate', 'set_password']) {
  await check(`${action}: successful mutation`, async () => {
    const f = fixture();
    const { response, body } = await f.request(
      action,
      action === 'set_password' ? { password } : {},
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    if (action === 'create' || action === 'update') assert.deepEqual(f.writes, [action]);
    else assert.ok([...f.intents.values()].every((v) => v === 'SUCCEEDED'));
  });
}
for (const action of ['create', 'update']) {
  await check(`${action}: failed atomic write cannot succeed`, async () => {
    const f = fixture({ failWrite: action });
    const { response, body } = await f.request(action);
    assert.equal(response.status, 400);
    assert.equal(body.error, 'MEMBER_WRITE_FAILED');
    assert.equal(f.writes.length, 0);
    assert.equal(
      f.calls.some(([name]) => name.startsWith('auth.')),
      false,
    );
  });
}
for (const action of ['create', 'set_password', 'deactivate', 'reactivate']) {
  await check(`${action}: failed intent prevents all Auth and member writes`, async () => {
    const f = fixture({ failIntent: true });
    const { response } = await f.request(action, { password });
    assert.equal(response.status, 503);
    assert.equal(
      f.calls.some(([name]) => name.startsWith('auth.')),
      false,
    );
    assert.equal(f.writes.length, 0);
  });
  await check(`${action}: completion failure preserves pending intent`, async () => {
    const f = fixture({ failFinish: true });
    const { response, body } = await f.request(action, { password });
    assert.equal(response.status, 202);
    assert.equal(body.ok, false);
    assert.equal(body.status, 'needs_review');
    assert.equal(f.intents.get(body.operation_id), 'STARTED');
    assert.ok(
      f.calls.findIndex(([name]) => name === 'member_admin_begin') <
        f.calls.findIndex(([name]) => name.startsWith('auth.')),
    );
  });
  await check(`${action}: existing pending operation prevents replay`, async () => {
    const f = fixture({ existingIntent: true });
    const { body } = await f.request(action, { password });
    assert.equal(body.operation_id, 'existing-operation');
    assert.equal(body.ok, false);
    assert.equal(
      f.calls.some(([name]) => name.startsWith('auth.')),
      false,
    );
    assert.equal(f.writes.length, 0);
  });
}
for (const option of ['authError', 'authThrow']) {
  await check(`${option}: password uncertainty is recorded, never retried`, async () => {
    const f = fixture({ [option]: true });
    const { body } = await f.request('set_password', { password });
    assert.equal(body.status, 'needs_review');
    assert.equal(f.intents.get(body.operation_id), 'NEEDS_REVIEW');
    assert.equal(f.calls.filter(([name]) => name.startsWith('auth.')).length, 1);
  });
}
await check('new login link failure keeps a recoverable Auth ID', async () => {
  const f = fixture({ noLogin: true, failWrite: 'link' });
  const { body } = await f.request('set_password', { password });
  assert.equal(body.status, 'needs_review');
  const finish = f.calls.find(([name]) => name === 'member_admin_finish')[1];
  assert.equal(finish.p_auth_user, authId);
  assert.equal(finish.p_reason, 'AUTH_USER_LINK_FAILED');
});
await check('inactive member receives a banned new Auth account', async () => {
  const f = fixture({ noLogin: true, active: false });
  const { body } = await f.request('set_password', { password });
  assert.equal(body.ok, true);
  assert.equal(f.calls.find(([name]) => name === 'auth.create')[1].ban_duration, '876000h');
});
await check('non-owner cannot write or start Auth intent', async () => {
  const f = fixture({ owner: false });
  const { response } = await f.request('create');
  assert.equal(response.status, 403);
  assert.deepEqual(
    f.calls.map(([name]) => name),
    ['is_owner'],
  );
});
await check('invalid password rejected before durable intent', async () => {
  const f = fixture();
  const { response } = await f.request('set_password', { password: 'short' });
  assert.equal(response.status, 400);
  assert.equal(f.intents.size, 0);
});
await check('member changes own password through the audited Auth workflow', async () => {
  const f = fixture({ userId: authId, owner: false });
  const { response, body } = await f.request('change_own_password', { password });
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(
    f.calls
      .filter(([name]) =>
        ['member_admin_begin', 'auth.update', 'member_admin_finish'].includes(name),
      )
      .map(([name]) => name),
    ['member_admin_begin', 'auth.update', 'member_admin_finish'],
  );
  assert.ok([...f.intents.values()].every((status) => status === 'SUCCEEDED'));
  assert.equal(f.writes.length, 0);
});
await check('self password containing username is rejected before creating intent', async () => {
  const f = fixture({ userId: authId, owner: false });
  const { response, body } = await f.request('change_own_password', {
    password: 'Fixture_Guide--123',
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'PASSWORD_TOO_WEAK');
  assert.equal(f.intents.size, 0);
});
await check('inactive member cannot change own password', async () => {
  const f = fixture({ userId: authId, owner: false, active: false });
  const { response } = await f.request('change_own_password', { password });
  assert.equal(response.status, 403);
  assert.equal(f.intents.size, 0);
});
for (const option of ['authError', 'authThrow']) {
  await check(`${option}: self password outcome is held for review`, async () => {
    const f = fixture({ userId: authId, owner: false, [option]: true });
    const { body } = await f.request('change_own_password', { password });
    assert.equal(body.status, 'needs_review');
    assert.equal(body.error, 'PASSWORD_CHANGE_NEEDS_REVIEW');
    assert.equal(f.intents.get(body.operation_id), 'NEEDS_REVIEW');
    assert.equal(f.calls.filter(([name]) => name === 'auth.update').length, 1);
  });
}
await check('create with password audits row, creates Auth, then audits link', async () => {
  const f = fixture();
  const { body } = await f.request('create', { password });
  assert.equal(body.ok, true);
  assert.deepEqual(f.writes, ['create', 'link']);
  assert.equal(f.calls.filter(([name]) => name === 'auth.create').length, 1);
  assert.ok([...f.intents.values()].every((v) => v === 'SUCCEEDED'));
});
await check('failed initial member write finalizes intent without calling Auth', async () => {
  const f = fixture({ failWrite: 'create' });
  const { response } = await f.request('create', { password });
  assert.equal(response.status, 400);
  assert.deepEqual([...f.intents.values()], ['FAILED']);
  assert.equal(
    f.calls.some(([name]) => name.startsWith('auth.')),
    false,
  );
});
for (const action of ['deactivate', 'reactivate']) {
  await check(`${action}: database failure after Auth change requires review`, async () => {
    const f = fixture({ failWrite: action });
    const { response, body } = await f.request(action);
    assert.equal(response.status, 202);
    assert.equal(body.ok, false);
    assert.equal(f.intents.get(body.operation_id), 'NEEDS_REVIEW');
    assert.equal(f.writes.length, 0);
    assert.equal(f.calls.filter(([name]) => name === 'auth.update').length, 1);
  });
}
console.log(
  `${passed} member Edge regression checks passed (simulated transport; SQL atomicity covered by pgTAP).`,
);
