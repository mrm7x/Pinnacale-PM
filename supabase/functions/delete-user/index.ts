// Supabase Edge Function: delete-user
// ----------------------------------------------------------------------------
// Deletes a user from Supabase Auth (auth.users). Runs the privileged
// admin.deleteUser() call SERVER-SIDE so the secret key never ships to the
// browser. Deleting the profile row (consultants/customers) is done separately
// by the client; this removes the corresponding auth account.
//
// SECURITY: identical posture to invite-user — the caller must be an
// admin/superuser consultant (mirrors public.is_admin()), verified from their
// own session JWT. Uses the ADMIN_SECRET_KEY function secret (a new sb_secret_
// key), not the disabled legacy service_role key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = Deno.env.get('ADMIN_SECRET_KEY')!;

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
  let userId = '';
  try {
    const body = await req.json();
    userId = String(body?.userId ?? '').trim();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }
  if (!userId) return json({ error: 'A userId is required' }, 400, cors);

  // Guard against an admin deleting their own auth account.
  if (userId === userData.user.id) {
    return json({ error: 'You cannot delete your own account' }, 400, cors);
  }

  // Tier hierarchy: only a superuser may delete another superuser. A plain
  // 'admin' cannot remove a superuser's account. (Customers are always tier
  // 'normal', so a missing target row / non-consultant target is unaffected.)
  if (consultant.tier !== 'superuser') {
    const { data: target } = await admin
      .from('consultants')
      .select('tier')
      .eq('id', userId)
      .maybeSingle();
    if (target && (target.tier as string) === 'superuser') {
      return json({ error: 'Forbidden: only a superuser can delete a superuser' }, 403, cors);
    }
  }

  // 4. Delete the auth user. Treat "user not found" as success so the app's
  //    profile-row delete still reconciles cleanly for already-missing users.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not.*found/i.test(error.message)) {
    return json({ error: error.message }, 400, cors);
  }

  return json({ success: true }, 200, cors);
});
