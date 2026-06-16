/**
 * Password hashing utilities using Web Crypto API (SHA-256).
 * 
 * Note: For a client-side-only app, hashing prevents casual plaintext exposure
 * in localStorage/DevTools. A proper backend with bcrypt/argon2 is the long-term solution.
 */

/**
 * Hashes a plaintext password to a hex-encoded SHA-256 digest.
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a plaintext password against a stored SHA-256 hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === storedHash;
}

/**
 * Generates a random session token (UUID v4-like).
 */
export function generateSessionToken(): string {
  return crypto.randomUUID?.() ?? 
    `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
