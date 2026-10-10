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
const invalid = () => json({ error: 'INVALID_CREDENTIALS' }, 401);

function normalizeIdentifier(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  let phone = value.replace(/[\s()-]/g, '');
  if (/^01\d{9}$/.test(phone)) phone = `+2${phone}`;
  else if (/^00201\d{9}$/.test(phone)) phone = `+${phone.slice(2)}`;
  if (/^\+\d{8,15}$/.test(phone)) return phone;
  return /^[a-z0-9_.]{3,30}$/i.test(value) ? value.toLowerCase() : '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const body = await request.json();
    const identifier = normalizeIdentifier(body?.identifier);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!identifier || !password) return invalid();

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: attempts, error: attemptsError } = await admin
      .from('login_attempts')
      .select('attempted_at, success')
      .eq('identifier', identifier)
      .eq('success', false)
      .gte('attempted_at', new Date(Date.now() - 10 * 60_000).toISOString())
      .order('attempted_at', { ascending: false })
      .limit(5);
    if (attemptsError) return json({ error: 'AUTH_UNAVAILABLE' }, 503);
    if ((attempts?.length ?? 0) >= 5) {
      const latestFailure = Date.parse(attempts![0].attempted_at);
      if (Date.now() < latestFailure + 10 * 60_000) return json({ error: 'LOCKED_OUT' }, 429);
    }

    const column = identifier.startsWith('+') ? 'phone' : 'username';
    const { data: member } = await admin
      .from('members')
      .select('id, auth_user_id, is_active')
      .eq(column, identifier)
      .maybeSingle();
    if (!member?.is_active || !member.auth_user_id) {
      await admin.from('login_attempts').insert({ identifier, success: false });
      return invalid();
    }
    const email = `m-${member.id}@members.dst-bts.app`;
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await userClient.auth.signInWithPassword({ email, password });
    await admin.from('login_attempts').insert({ identifier, success: !error });
    if (error || !data.session) return invalid();
    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return invalid();
  }
});
