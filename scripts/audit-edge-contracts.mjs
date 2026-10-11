// Offline audit of the actual Edge Function handlers with a simulated database,
// clock and Auth transport. Does not establish hosted GoTrue/RLS correctness.
// Exits nonzero for a requirement violation; this diagnostic is separate from CI.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const checks = [];
const check = (name, actual, expected) =>
  checks.push({ name, pass: Object.is(actual, expected), actual, expected });

function load(name, createClient, now = Date.parse('2026-10-11T10:00:00Z')) {
  let handler;
  const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8').replace(
    /^import .*createClient.*;\r?\n/m,
    '',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const context = vm.createContext({
    createClient,
    Date: Clock,
    Response,
    Deno: {
      env: { get: (key) => key },
      serve: (callback) => (handler = callback),
    },
  });
  vm.runInContext(code, context);
  return { handler, context };
}

function loginClient(failures, member, now) {
  return () => ({
    from(table) {
      if (table === 'members') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: member }),
        };
      }
      let since = 0;
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte(_column, value) {
          since = Date.parse(value);
          return this;
        },
        order() {
          return this;
        },
        limit: async (limit) => ({
          data: failures
            .filter((at) => at >= since && at <= now)
            .sort((a, b) => b - a)
            .slice(0, limit)
            .map((at) => ({ attempted_at: new Date(at).toISOString(), success: false })),
        }),
        insert: async () => ({ error: null }),
      };
    },
    auth: {
      signInWithPassword: async () => ({ error: { message: 'Synthetic rejection' } }),
    },
  });
}

const base = Date.parse('2026-10-11T10:00:00Z');
const active = { id: 'fixture-member', auth_user_id: 'fixture-user', is_active: true };
const probe = load('login', loginClient([], active, base));
for (const [value, expected] of [
  ['01012345678', '+201012345678'],
  ['00201012345678', '+201012345678'],
  ['+20 (10) 1234-5678', '+201012345678'],
  [' Masry ', 'masry'],
  ['', ''],
  [null, ''],
]) {
  check(
    `identifier normalization: ${JSON.stringify(value)}`,
    vm.runInContext(`normalizeIdentifier(${JSON.stringify(value)})`, probe.context),
    expected,
  );
}
const request = () =>
  new Request('https://fixture.invalid/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'masry', password: 'fixture-only' }),
  });
const failures = [0, 1, 2, 3, 4].map((minute) => base + minute * 60_000);
for (const [minutes, expected] of [
  [5, 429],
  [10.5, 429],
  [14.1, 401],
]) {
  const now = base + minutes * 60_000;
  const { handler } = load('login', loginClient(failures, active, now), now);
  check(
    `five failures at minutes 0..4; request at minute ${minutes}`,
    (await handler(request())).status,
    expected,
  );
}

// Verify that a member mutation cannot report success when its audit write fails.
function membersClient(owner, failAudit) {
  return () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-owner' } } }) },
    rpc: async () => ({ data: owner }),
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        insert() {
          if (table === 'audit_log')
            return Promise.resolve({ error: failAudit ? { code: 'fixture-failure' } : null });
          return this;
        },
        single: async () => ({ data: { id: 'fixture-created' } }),
        maybeSingle: async () => ({ data: { id: 'fixture-owner-member' } }),
      };
    },
  });
}
function memberRequest() {
  return new Request('https://fixture.invalid/members', {
    method: 'POST',
    headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      username: 'fixture_guide',
      full_name_en: 'Fixture Guide',
    }),
  });
}
for (const [owner, failAudit, expected] of [
  [false, false, 403],
  [true, false, 200],
]) {
  const { handler } = load('members', membersClient(owner, failAudit));
  check(
    `member create owner=${owner}, audit available`,
    (await handler(memberRequest())).status,
    expected,
  );
}
const { handler } = load('members', membersClient(true, true));
check(
  'member create with failed audit must not report success',
  (await handler(memberRequest())).ok,
  false,
);

console.log(
  JSON.stringify(
    { passed: checks.filter((item) => item.pass).length, total: checks.length, checks },
    null,
    2,
  ),
);
if (checks.some((item) => !item.pass)) process.exitCode = 1;
