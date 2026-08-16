/**
 * Supabase connection details.
 *
 * Both values are safe to expose: the anon key only ever acts through the
 * RLS policies in docs/schema.sql. The service-role key is deliberately
 * absent from this file — it must never reach the browser.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False until .env.local is filled in, which turns the app into a setup guide. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
