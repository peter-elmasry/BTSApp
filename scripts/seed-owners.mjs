import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OWNER_MASRY_PASSWORD',
  'OWNER_GENDUI_PASSWORD',
];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);
for (const name of required.slice(2))
  if (process.env[name].length < 12) throw new Error(`${name} must be at least 12 characters`);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function checked(response) {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

// Administrative bootstrap exception to the browser RPC-only rule. Never imported by Angular.
// Re-runs preserve IDs and existing passwords. Interrupted auth creation is recovered by email.
for (const username of ['masry', 'gendui']) {
  let member = checked(
    await db
      .from('members')
      .select('id,auth_user_id,system_role')
      .eq('username', username)
      .maybeSingle(),
  );
  if (member && member.system_role !== 'OWNER')
    throw new Error(`Refusing to promote existing member ${username}; review via SQL`);
  if (!member) {
    member = checked(
      await db
        .from('members')
        .insert({
          id: randomUUID(),
          username,
          full_name_en: username,
          system_role: 'OWNER',
          phone: null,
        })
        .select('id,auth_user_id,system_role')
        .single(),
    );
  }
  const email = `m-${member.id}@members.dst-bts.app`;
  if (!member.auth_user_id) {
    let authUser;
    for (let page = 1; !authUser; page++) {
      const users = checked(await db.auth.admin.listUsers({ page, perPage: 1000 })).users;
      authUser = users.find((u) => u.email === email);
      if (users.length < 1000) break;
    }
    if (!authUser)
      authUser = checked(
        await db.auth.admin.createUser({
          email,
          password: process.env[`OWNER_${username.toUpperCase()}_PASSWORD`],
          email_confirm: true,
        }),
      ).user;
    checked(await db.from('members').update({ auth_user_id: authUser.id }).eq('id', member.id));
    checked(
      await db.from('audit_log').insert({
        actor_id: member.id,
        action: 'OWNER_SEEDED',
        entity: 'members',
        entity_id: member.id,
        after: { username },
      }),
    );
  }
  console.log(`Owner ${username} ready (password preserved on rerun).`);
}
