import { createClient } from '@supabase/supabase-js';

// SECURITY: use sessionStorage for auth tokens instead of the default
// localStorage. This means closing the browser (or all tabs of the app)
// destroys the session — the user must re-authenticate on the next visit.
// Refreshing a single tab stays logged in, since sessionStorage persists
// for the lifetime of the tab. autoRefreshToken still works within a tab.
const AUTH_STORAGE = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined;

// Credentials may come from build-time env vars (preferred) or, in DEVELOPMENT
// ONLY, from localStorage when a developer has explicitly enabled Supabase via
// the Settings panel. In production builds the localStorage opt-in is ignored,
// so credentials must come from env vars — this prevents a runtime-configurable
// host and lets the CSP lock connect-src to the real Supabase project.
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only under `vite dev`. Production builds hard-fail the localStorage path.
const IS_DEV = import.meta.env.DEV;

// Opt-in flag. Env vars always win; localStorage config is only honored when the
// user has set this flag through the Settings panel AND we are in a dev build.
const OPT_IN_KEY = 'pinnacle_supabase_enabled';

/**
 * Whether Supabase should be used at all.
 * - Env vars present → yes (server-provided config).
 * - No env vars → only in dev, and only if the developer opted in via Settings.
 */
export function isSupabaseEnabled(): boolean {
  if (envUrl && envAnonKey) return true;
  return IS_DEV && localStorage.getItem(OPT_IN_KEY) === 'true';
}

export function setSupabaseEnabled(enabled: boolean) {
  if (enabled) localStorage.setItem(OPT_IN_KEY, 'true');
  else localStorage.removeItem(OPT_IN_KEY);
}

export function getSupabaseCredentials() {
  const url = envUrl || (isSupabaseEnabled() ? localStorage.getItem('pinnacle_supabase_url') : '') || '';
  const anonKey = envAnonKey || (isSupabaseEnabled() ? localStorage.getItem('pinnacle_supabase_anon_key') : '') || '';
  return {
    url: url.trim(),
    anonKey: anonKey.trim(),
    isFromEnv: !!(envUrl && envAnonKey)
  };
}

export function isSupabaseConfigured(): boolean {
  if (!isSupabaseEnabled()) return false;
  const { url, anonKey } = getSupabaseCredentials();
  return url.length > 0 && anonKey.length > 0;
}

// Lazy initialization of Supabase client to prevent crashes if credentials aren't set yet
let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    supabaseInstance = null;
    return null;
  }

  const { url, anonKey } = getSupabaseCredentials();
  
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: AUTH_STORAGE
      }
    });
  }
  
  return supabaseInstance;
}

/**
 * Tests connection with the configured Supabase client by fetching a single row from consultants table.
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Supabase credentials are not configured.' };
  }

  try {
    const { error } = await client.from('consultants').select('id').limit(1);
    if (error) {
      throw error;
    }
    return { success: true, message: 'Successfully connected to Supabase database!' };
  } catch (err: any) {
    console.error('Supabase connection test failed:', err);
    return { success: false, message: err.message || 'Failed to connect to Supabase.' };
  }
}

/**
 * Creates a temporary Supabase client with session persistence disabled.
 * This is used for administrative tasks (like registering other users)
 * without affecting the currently active session in the app.
 */
export function createTemporarySupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = getSupabaseCredentials();
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
