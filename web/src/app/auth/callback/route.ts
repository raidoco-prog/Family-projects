import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Written with the service-role client on purpose. calendar_connections has
 * RLS on and no policy at all, so nothing reachable from a browser can read
 * the refresh token back — not even the member it belongs to.
 *
 * A failure here must not break signing in: the user still has a session,
 * they just have no calendar sync, and Settings will say so.
 */
async function storeCalendarConnection(
  userId: string,
  email: string | undefined,
  refreshToken: string,
) {
  try {
    const db = createAdminClient();
    const { data: member } = await db
      .from("members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle<{ id: string }>();
    if (!member) return;

    await db.from("calendar_connections").upsert(
      {
        member_id: member.id,
        google_email: email ?? null,
        refresh_token: refreshToken,
        // A fresh grant invalidates any resume point: read the window again.
        sync_token: null,
        last_error: null,
      },
      { onConflict: "member_id" },
    );
  } catch {
    // No service-role key configured, or the table is not there yet.
  }
}

/** Sends the browser back to the login screen with something it can show. */
function back(origin: string, reason: string) {
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(reason)}`,
  );
}

/** Exchanges the OAuth / magic-link code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  // Google and Supabase both report refusals by redirecting here with an
  // error instead of a code. Passing the reason on is the difference between
  // a fixable message and a login button that appears to do nothing.
  const refused =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (refused) return back(origin, refused);

  const code = searchParams.get("code");
  if (!code) return back(origin, "missing_code");

  const rawNext = searchParams.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return back(origin, error.message);

  // Google hands back a refresh token only on the consent round trip, and
  // Supabase does not persist it. If it is not captured here it is gone,
  // and the calendar sync has nothing to run on.
  const refreshToken = data.session?.provider_refresh_token;
  if (refreshToken && data.user) {
    await storeCalendarConnection(data.user.id, data.user.email, refreshToken);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
