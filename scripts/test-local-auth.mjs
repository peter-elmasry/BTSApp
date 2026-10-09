import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// CI-only local Supabase status file. Never echo its credentials or JWTs.
const path = process.env.SUPABASE_ENV_FILE;
if (!path) throw new Error('Set SUPABASE_ENV_FILE to local supabase status -o env output');
const values = {};
for (const line of (await readFile(path, 'utf8')).split('\n')) {
  const match = line.trim().match(/^([A-Z_]+)="(.*)"$/);
  if (match) values[match[1]] = match[2];
}
const url = values.API_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('This seed/auth test is restricted to localhost; never run against hosted data');
}
const env = {
  ...process.env,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
  OWNER_MASRY_PASSWORD: randomBytes(24).toString('base64url'),
  OWNER_GENDUI_PASSWORD: randomBytes(24).toString('base64url'),
};
const admin = createClient(url, values.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function checked(response) {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}
execFileSync(process.execPath, ['scripts/seed-owners.mjs'], { env, stdio: 'pipe' });
const first = checked(
  await admin
    .from('members')
    .select('id,username,auth_user_id,system_role,phone')
    .in('username', ['masry', 'gendui'])
    .order('username'),
);
if (
  first.length !== 2 ||
  first.some(
    (member) => member.system_role !== 'OWNER' || member.phone !== null || !member.auth_user_id,
  )
)
  throw new Error('Owner seed fields incorrect');
// Different passwords on rerun must preserve originals and member/Auth IDs.
execFileSync(process.execPath, ['scripts/seed-owners.mjs'], {
  env: {
    ...env,
    OWNER_MASRY_PASSWORD: randomBytes(24).toString('hex'),
    OWNER_GENDUI_PASSWORD: randomBytes(24).toString('hex'),
  },
  stdio: 'pipe',
});
const second = checked(
  await admin
    .from('members')
    .select('id,username,auth_user_id,system_role,phone')
    .in('username', ['masry', 'gendui'])
    .order('username'),
);
if (JSON.stringify(first) !== JSON.stringify(second))
  throw new Error('Owner seed rerun changed identity');
for (const member of first) {
  const client = createClient(url, values.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  checked(
    await client.auth.signInWithPassword({
      email: `m-${member.id}@members.dst-bts.app`,
      password: env[`OWNER_${member.username.toUpperCase()}_PASSWORD`],
    }),
  );
  if (checked(await client.rpc('is_owner')) !== true)
    throw new Error('Seeded Auth JWT does not grant owner permission');
  checked(await client.auth.signOut());
}
console.log(
  'Local GoTrue: both synthetic-email owners authenticate; seed rerun preserves IDs/passwords; owner RPC recognizes JWTs.',
);
