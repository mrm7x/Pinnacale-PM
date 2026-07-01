// Safe-URL helpers.
// ---------------------------------------------------------------------------
// Project link fields (Trello / SharePoint / Sage CRM) are free-text and are
// rendered into anchor `href`s. Without validation a user with edit rights
// could store a `javascript:` (or other non-http) URL that would execute in a
// victim's session on click — a stored-XSS vector. The app's CSP already blocks
// inline/`javascript:` script execution, but we validate here too as
// defense-in-depth so the value is never trusted on its own.

/**
 * Returns the URL only if it is a safe http(s) link, otherwise `undefined`.
 * Use for any `href` built from user-supplied text.
 */
export function safeExternalUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Not an absolute URL (or malformed) — reject rather than guess a scheme.
  }
  return undefined;
}
