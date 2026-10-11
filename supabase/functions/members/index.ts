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
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return fail('UNAUTHORIZED', 401);
    const { data: isOwner, error: ownerError } = await caller.rpc('is_owner');
    if (ownerError || !isOwner) return fail('FORBIDDEN', 403);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    const body = await request.json();
    const action = body?.action;
    if (!['create', 'update', 'set_password', 'deactivate', 'reactivate'].includes(action))
      return fail('INVALID_ACTION', 400);
    const memberId = action === 'create' ? crypto.randomUUID() : body?.member_id;
    if (typeof memberId !== 'string' || !/^[0-9a-f-]{36}$/i.test(memberId))
      return fail('INVALID_MEMBER', 400);
    const actor = userData.user.id;
    const values: Record<string, unknown> = {};
    if (action === 'create' || action === 'update') {
      if (action === 'create' || body.username !== undefined) {
        const username =
          typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
        if (!usernamePattern.test(username)) return fail('INVALID_MEMBER', 400);
        values.username = username;
      }
      if (action === 'create' || body.full_name_en !== undefined) {
        const name = typeof body.full_name_en === 'string' ? body.full_name_en.trim() : '';
        if (!name) return fail('INVALID_MEMBER', 400);
        values.full_name_en = name;
      }
      if (action === 'create' || body.phone !== undefined) {
        const phone = normalizePhone(body.phone);
        if (body.phone !== undefined && body.phone !== null && body.phone !== '' && !phone)
          return fail('INVALID_MEMBER', 400);
        values.phone = phone;
      }
      if (action === 'create' || body.full_name_ar !== undefined) {
        if (body.full_name_ar != null && typeof body.full_name_ar !== 'string')
          return fail('INVALID_MEMBER', 400);
        values.full_name_ar =
          typeof body.full_name_ar === 'string' ? body.full_name_ar.trim() || null : null;
      }
    }
    const withPassword =
      action === 'set_password' ||
      (action === 'create' && body.password !== undefined && body.password !== '');
    if (withPassword && (typeof body.password !== 'string' || body.password.length < 12))
      return fail('INVALID_PASSWORD', 400);
    const write = (writeAction: string, patch: Record<string, unknown> = {}) =>
      admin.rpc('member_admin_write', {
        p_op_id: crypto.randomUUID(),
        p_actor: actor,
        p_action: writeAction,
        p_member: memberId,
        p_values: patch,
      });
    const writeFailure = (error: { code?: string } | null) =>
      fail(error?.code === '23505' ? 'DUPLICATE_MEMBER' : 'MEMBER_WRITE_FAILED', 400);
    if (action === 'update' || (action === 'create' && !withPassword)) {
      const { error } = await write(action, values);
      return error ? writeFailure(error) : json({ member_id: memberId, ok: true });
    }
    const { data: member, error: readError } =
      action === 'create'
        ? { data: { auth_user_id: null, is_active: true }, error: null }
        : await admin
            .from('members')
            .select('id, auth_user_id, is_active')
            .eq('id', memberId)
            .maybeSingle();
    if (readError || !member) return fail('NOT_FOUND', 404);
    const operationId = crypto.randomUUID();
    const { data: intent, error: intentError } = await admin.rpc('member_admin_begin', {
      p_op_id: operationId,
      p_actor: actor,
      p_member: memberId,
      p_action: action,
    });
    if (intentError || !intent) return fail('AUDIT_WRITE_FAILED', 503);
    const pending = (id = operationId) =>
      json({ member_id: memberId, ok: false, status: 'needs_review', operation_id: id }, 202);
    if (intent.status !== 'STARTED') return pending(intent.id);
    let authUserId: string | null = member.auth_user_id;
    const finish = async (status: string, reason: string | null = null) => {
      try {
        const { error } = await admin.rpc('member_admin_finish', {
          p_op_id: operationId,
          p_status: status,
          p_auth_user: authUserId,
          p_reason: reason,
        });
        return !error;
      } catch {
        return false;
      }
    };
    // An intent survives transport failures and process termination. Never retry
    // external password writes or claim rollback after an ambiguous Auth result.
    try {
      if (action === 'create') {
        const { error } = await write('create', values);
        if (error) {
          const recorded = await finish('FAILED', 'MEMBER_WRITE_FAILED');
          return recorded ? writeFailure(error) : pending();
        }
      }
      if (withPassword) {
        if (authUserId) {
          const { error } = await admin.auth.admin.updateUserById(authUserId, {
            password: body.password,
            ban_duration: member.is_active ? 'none' : '876000h',
          });
          if (error) {
            await finish('NEEDS_REVIEW', 'PASSWORD_UPDATE_FAILED');
            return pending();
          }
        } else {
          const { data: created, error } = await admin.auth.admin.createUser({
            email: syntheticEmail(memberId),
            password: body.password,
            email_confirm: true,
            ban_duration: member.is_active ? 'none' : '876000h',
          });
          if (error || !created.user) {
            await finish('NEEDS_REVIEW', 'AUTH_USER_CREATE_FAILED');
            return pending();
          }
          authUserId = created.user.id;
          const { error: linkError } = await write('link', { auth_user_id: authUserId });
          if (linkError) {
            await finish('NEEDS_REVIEW', 'AUTH_USER_LINK_FAILED');
            return pending();
          }
        }
      } else {
        if (authUserId) {
          const { error } = await admin.auth.admin.updateUserById(authUserId, {
            ban_duration: action === 'reactivate' ? 'none' : '876000h',
          });
          if (error) {
            await finish('NEEDS_REVIEW', 'AUTH_STATE_UPDATE_FAILED');
            return pending();
          }
        }
        const { error } = await write(action);
        if (error) {
          await finish('NEEDS_REVIEW', 'MEMBER_WRITE_FAILED');
          return pending();
        }
      }
      return (await finish('SUCCEEDED')) ? json({ member_id: memberId, ok: true }) : pending();
    } catch {
      await finish('NEEDS_REVIEW', 'TRANSPORT_FAILED');
      return pending();
    }
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
