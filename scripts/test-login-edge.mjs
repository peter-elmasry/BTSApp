import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadEdgeHandler } from './edge-handler-harness.mjs';

const active = { id: 'fixture-member', auth_user_id: 'fixture-user', is_active: true };
let count = 0;
function fixture(options = {}) {
  const calls = [];
  const client = () => ({
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'begin_login_attempt')
        return {
          data: { status: options.status ?? 'allowed', attempt_id: 'fixture-attempt' },
          error: options.beginError,
        };
      assert.equal(name, 'finish_login_attempt');
      return { data: options.finished ?? true, error: options.finishError };
    },
    from: (table) => {
      assert.equal(table, 'members');
      return {
        select() {
          return this;
        },
        eq(column, value) {
          calls.push({ name: 'lookup', column, value });
          return this;
        },
        maybeSingle: async () => ({
          data: options.member === undefined ? active : options.member,
          error: options.memberError,
        }),
      };
    },
    auth: {
      signInWithPassword: async () => {
        calls.push({ name: 'auth' });
        if (options.authThrows) throw new Error('transport unavailable');
        return options.valid
          ? {
              data: {
                session: { access_token: 'fixture-access', refresh_token: 'fixture-refresh' },
              },
              error: null,
            }
          : { data: { session: null }, error: { message: 'invalid' } };
      },
    },
  });
  return { ...loadEdgeHandler('login', client), calls };
}
const request = (identifier = 'masry') =>
  new Request('https://fixture.invalid/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password: 'fixture-only' }),
  });
const normalization = fixture();
for (const [value, expected] of [
  ['01012345678', '+201012345678'],
  ['00201012345678', '+201012345678'],
  ['+20 (10) 1234-5678', '+201012345678'],
  [' Masry ', 'masry'],
  ['', ''],
  [null, ''],
]) {
  assert.equal(
    vm.runInContext(`normalizeIdentifier(${JSON.stringify(value)})`, normalization.context),
    expected,
  );
  count++;
}
for (const [options, expectedStatus, expectedAuthCalls] of [
  [{ status: 'locked' }, 429, 0],
  [{ status: 'busy' }, 503, 0],
  [{ beginError: {} }, 503, 0],
  [{ status: 'unexpected' }, 503, 0],
  [{ member: null }, 401, 0],
  [{ member: { ...active, is_active: false } }, 401, 0],
  [{ member: { ...active, auth_user_id: null } }, 401, 0],
  [{ memberError: {} }, 503, 0],
  [{}, 401, 1],
  [{ valid: true }, 200, 1],
  [{ valid: true, finishError: {} }, 503, 1],
  [{ finished: false }, 503, 1],
  [{ valid: true, finished: false }, 503, 1],
  [{ authThrows: true }, 503, 1],
]) {
  const { handler, calls } = fixture(options);
  const response = await handler(request());
  assert.equal(response.status, expectedStatus, JSON.stringify(options));
  assert.equal(calls.filter((call) => call.name === 'auth').length, expectedAuthCalls);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  if (expectedStatus !== 200) assert.equal(result.access_token, undefined);
  const finish = calls.find((call) => call.name === 'finish_login_attempt');
  if (finish) assert.equal(finish.args.p_success, !!options.valid);
  count++;
}
for (const [identifier, column, value] of [
  [' Masry ', 'username', 'masry'],
  ['01012345678', 'phone', '+201012345678'],
]) {
  const { handler, calls } = fixture();
  await handler(request(identifier));
  assert.equal(calls[0].args.p_identifier, value);
  assert.deepEqual(
    calls.find((call) => call.name === 'lookup'),
    { name: 'lookup', column, value },
  );
  count++;
}
console.log(`Login handler: ${count} checks passed (mocked transport).`);
