// Supabase Edge Function: invite-user
// ----------------------------------------------------------------------------
// Sends an auth invite / password-reset re-invite to a user. This runs the
// privileged admin.inviteUserByEmail() call SERVER-SIDE so the Supabase secret
// key never ships to the browser.
//
// SECURITY:
//   - The caller is identified from their own session JWT (forwarded
//     automatically by supabase.functions.invoke) and must be an admin or
//     superuser consultant, mirroring the public.is_admin() RLS helper.
//   - Uses a NEW secret key (sb_secret_...) stored as the ADMIN_SECRET_KEY
//     function secret. We deliberately avoid the auto-injected legacy
//     SUPABASE_SERVICE_ROLE_KEY, which this project has disabled.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = Deno.env.get('ADMIN_SECRET_KEY')!;

// Origins allowed to call this function. Defaults to production; override with a
// comma-separated ALLOWED_ORIGINS secret (e.g. to add http://localhost:3000).
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://pinnacle-pm.uk')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const admin = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Authenticate the caller from their session JWT.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing authorization token' }, 401, cors);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: 'Invalid or expired session' }, 401, cors);
  }

  // 2. Authorize: caller must be an admin/superuser consultant.
  const { data: consultant, error: tierErr } = await admin
    .from('consultants')
    .select('tier')
    .eq('id', userData.user.id)
    .single();
  if (tierErr || !consultant || !['admin', 'superuser'].includes(consultant.tier as string)) {
    return json({ error: 'Forbidden: admin privileges required' }, 403, cors);
  }

  // 3. Validate input.
  let email = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'A valid email address is required' }, 400, cors);
  }

  // 4. Send the invite with admin privileges.
  const redirectTo = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) return json({ error: error.message }, 400, cors);

  return json({ user: { id: data.user?.id ?? null } }, 200, cors);
});
