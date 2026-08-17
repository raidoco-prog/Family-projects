/**
 * Where to land after signing in.
 *
 * This does NOT travel in the redirectTo query string. Supabase validates
 * redirectTo against the Redirect URLs allow list, and an entry without a
 * wildcard does not match a URL carrying `?next=...`. When it fails to
 * match, Supabase does not report anything — it quietly substitutes the
 * Site URL. The visible result is landing on the app root instead of the
 * invite, which for somebody with no member row yet is the "create a
 * household" screen: a dead end, in the middle of accepting an invitation.
 *
 * A cookie sidesteps the allow list entirely, so redirectTo stays a bare
 * `/auth/callback` that any configuration matches.
 */
export const NEXT_COOKIE = "fp_next";

/** Long enough to sign in with a password manager, short enough to go stale. */
export const NEXT_COOKIE_MAX_AGE = 15 * 60;

/**
 * Only same-origin paths. `//host` is a protocol-relative URL and would be
 * an open redirect, so it is rejected along with anything absolute.
 */
export function safePath(raw: string | undefined | null, fallback = "/"): string {
  if (!raw) return fallback;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}
