import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";

/**
 * Server-side Supabase client bound to the request's cookies.
 *
 * setAll throws when called from a Server Component (cookies are read-only
 * there). That is expected and safe to swallow: middleware refreshes the
 * session on every request, so the component only ever needs to read.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component render — middleware owns the refresh.
        }
      },
    },
  });
}
