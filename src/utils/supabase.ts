import { createClient } from '@supabase/supabase-js';

// Credentials may come from build-time env vars (preferred) or, when the user
// has EXPLICITLY enabled Supabase in Settings, from localStorage.
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Opt-in flag. Env vars always win; localStorage config is only honored when the
// user has set this flag through the Settings panel. This prevents stale
// localStorage credentials from silently routing login to the Supabase branch
// (and blocking the local admin/manager fallback).
const OPT_IN_KEY = 'pinnacle_supabase_enabled';

/**
 * Whether Supabase should be used at all.
 * - Env vars present → yes (server-provided config).
 * - No env vars → only if the user explicitly opted in via Settings.
 */
export function isSupabaseEnabled(): boolean {
  if (envUrl && envAnonKey) return true;
  return localStorage.getItem(OPT_IN_KEY) === 'true';
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
        detectSessionInUrl: true
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
