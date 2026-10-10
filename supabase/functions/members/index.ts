import { createClient } from 'npm:@supabase/supabase-js@2';

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
const fail = (code: string, status: number) => json({ error: code }, status);
const syntheticEmail = (id: string) => `m-${id}@members.dst-bts.app`;
const usernamePattern = /^[a-z0-9_.]{3,30}$/;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return fail('UNAUTHORIZED', 401);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return fail('UNAUTHORIZED', 401);
    const { data: isOwner, error: ownerError } = await caller.rpc('is_owner');
    if (ownerError || !isOwner) return fail('FORBIDDEN', 403);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const body = await request.json();
    const action = body?.action;
    const memberId = typeof body?.member_id === 'string' ? body.member_id : '';
    const actor = userData.user.id;
    let subjectId = memberId;
    let auditAction = '';

    if (action === 'create') {
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const nameEn = typeof body.full_name_en === 'string' ? body.full_name_en.trim() : '';
      const phone = normalizePhone(body.phone);
      if (
        body.password !== undefined &&
        body.password !== '' &&
        (typeof body.password !== 'string' || body.password.length < 12)
      )
        return fail('INVALID_PASSWORD', 400);
      if (
        !usernamePattern.test(username) ||
        !nameEn ||
        (body.phone !== undefined && body.phone !== null && body.phone !== '' && !phone)
      )
        return fail('INVALID_MEMBER', 400);
      const { data: member, error } = await admin
        .from('members')
        .insert({
          username,
          phone,
          full_name_en: nameEn,
          full_name_ar:
            typeof body.full_name_ar === 'string' ? body.full_name_ar.trim() || null : null,
          created_by:
            (await admin.from('members').select('id').eq('auth_user_id', actor).maybeSingle()).data
              ?.id ?? null,
        })
        .select('id')
        .single();
      if (error || !member)
        return fail(error?.code === '23505' ? 'DUPLICATE_MEMBER' : 'MEMBER_WRITE_FAILED', 400);
      subjectId = member.id;
      if (typeof body.password === 'string' && body.password.length > 0) {
        const { data: created, error: authError } = await admin.auth.admin.createUser({
          email: syntheticEmail(subjectId),
          password: body.password,
          email_confirm: true,
        });
        if (authError || !created.user) {
          await admin.from('members').delete().eq('id', subjectId);
          return fail('AUTH_USER_CREATE_FAILED', 400);
        }
        const { error: linkError } = await admin
          .from('members')
          .update({ auth_user_id: created.user.id, updated_at: new Date().toISOString() })
          .eq('id', subjectId);
        if (linkError) {
          await admin.auth.admin.deleteUser(created.user.id);
          await admin.from('members').delete().eq('id', subjectId);
          return fail('AUTH_USER_LINK_FAILED', 500);
        }
      }
      auditAction = 'MEMBER_CREATED';
    } else {
      const { data: member, error } = await admin
        .from('members')
        .select('id, auth_user_id, is_active')
        .eq('id', memberId)
        .maybeSingle();
      if (error || !member) return fail('NOT_FOUND', 404);
      if (action === 'update') {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof body.username === 'string') {
          const username = body.username.trim().toLowerCase();
          if (!usernamePattern.test(username)) return fail('INVALID_MEMBER', 400);
          patch.username = username;
        }
        if (typeof body.phone === 'string' || body.phone === null) {
          const phone = normalizePhone(body.phone);
          if (body.phone && !phone) return fail('INVALID_MEMBER', 400);
          patch.phone = phone;
        }
        if (typeof body.full_name_en === 'string' && body.full_name_en.trim())
          patch.full_name_en = body.full_name_en.trim();
        if (typeof body.full_name_ar === 'string' || body.full_name_ar === null)
          patch.full_name_ar =
            typeof body.full_name_ar === 'string' ? body.full_name_ar.trim() || null : null;
        const { error: updateError } = await admin.from('members').update(patch).eq('id', memberId);
        if (updateError)
          return fail(
            updateError.code === '23505' ? 'DUPLICATE_MEMBER' : 'MEMBER_WRITE_FAILED',
            400,
          );
        auditAction = 'MEMBER_UPDATED';
      } else if (action === 'set_password') {
        if (typeof body.password !== 'string' || body.password.length < 12)
          return fail('INVALID_PASSWORD', 400);
        if (member.auth_user_id) {
          const { error: passError } = await admin.auth.admin.updateUserById(member.auth_user_id, {
            password: body.password,
            ban_duration: member.is_active ? 'none' : '876000h',
          });
          if (passError) return fail('PASSWORD_UPDATE_FAILED', 400);
        } else {
          const { data: created, error: authError } = await admin.auth.admin.createUser({
            email: syntheticEmail(memberId),
            password: body.password,
            email_confirm: true,
          });
          if (authError || !created.user) return fail('AUTH_USER_CREATE_FAILED', 400);
          const { error: linkError } = await admin
            .from('members')
            .update({ auth_user_id: created.user.id, updated_at: new Date().toISOString() })
            .eq('id', memberId);
          if (linkError) {
            await admin.auth.admin.deleteUser(created.user.id);
            return fail('AUTH_USER_LINK_FAILED', 500);
          }
        }
        auditAction = 'MEMBER_PASSWORD_SET';
      } else if (action === 'deactivate' || action === 'reactivate') {
        const active = action === 'reactivate';
        if (member.auth_user_id) {
          const { error: authStateError } = await admin.auth.admin.updateUserById(
            member.auth_user_id,
            { ban_duration: active ? 'none' : '876000h' },
          );
          if (authStateError) return fail('AUTH_STATE_UPDATE_FAILED', 400);
        }
        const { error: stateError } = await admin
          .from('members')
          .update({ is_active: active, updated_at: new Date().toISOString() })
          .eq('id', memberId);
        if (stateError) {
          if (member.auth_user_id)
            await admin.auth.admin.updateUserById(member.auth_user_id, {
              ban_duration: member.is_active ? 'none' : '876000h',
            });
          return fail('MEMBER_WRITE_FAILED', 400);
        }
        auditAction = active ? 'MEMBER_REACTIVATED' : 'MEMBER_DEACTIVATED';
      } else return fail('INVALID_ACTION', 400);
    }

    const { data: actorMember } = await admin
      .from('members')
      .select('id')
      .eq('auth_user_id', actor)
      .maybeSingle();
    await admin.from('audit_log').insert({
      actor_id: actorMember?.id ?? null,
      action: auditAction,
      entity: 'member',
      entity_id: subjectId,
      after: { action },
    });
    return json({ member_id: subjectId, ok: true });
  } catch {
    return fail('INVALID_REQUEST', 400);
  }
});

function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return '';
  let phone = value.trim().replace(/[\s()-]/g, '');
  if (/^01\d{9}$/.test(phone)) phone = `+2${phone}`;
  else if (/^00201\d{9}$/.test(phone)) phone = `+${phone.slice(2)}`;
  return /^\+\d{8,15}$/.test(phone) ? phone : '';
}
