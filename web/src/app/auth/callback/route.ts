import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEXT_COOKIE, safePath } from "@/lib/next-path";

/**
 * Written with the service-role client on purpose. calendar_connections has
 * RLS on and no policy at all, so nothing reachable from a browser can read
 * the refresh token back — not even the member it belongs to.
 *
 * A failure here must not break signing in — the user still has a valid
 * session — but it must not be silent either. Swallowing it meant Google
 * granted the permission, the app dropped the token, and the card went on
 * saying "not connected" with nothing to explain why. Returns the reason.
 */
async function storeCalendarConnection(
  userId: string,
  email: string | undefined,
  refreshToken: string,
): Promise<string | null> {
  try {
    const db = createAdminClient();
    const { data: member } = await db
      .from("members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle<{ id: string }>();
    if (!member) return "no member row for this account";

    const { error } = await db.from("calendar_connections").upsert(
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
    return error ? error.message : null;
  } catch (err) {
    // Overwhelmingly this is a missing SUPABASE_SERVICE_ROLE_KEY.
    return err instanceof Error ? err.message : "could not store the grant";
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

  // The cookie is the real carrier; the query string is only still read so
  // that a link issued by the previous build still lands correctly.
  const fromCookie = request.cookies.get(NEXT_COOKIE)?.value;
  const next = safePath(
    searchParams.get("next") ??
      (fromCookie ? decodeURIComponent(fromCookie) : null),
  );

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return back(origin, error.message);

  // Google hands back a refresh token only on the consent round trip, and
  // Supabase does not persist it. If it is not captured here it is gone,
  // and the calendar sync has nothing to run on.
  const refreshToken = data.session?.provider_refresh_token;

  let calendarError: string | null = null;
  if (refreshToken && data.user) {
    calendarError = await storeCalendarConnection(
      data.user.id,
      data.user.email,
      refreshToken,
    );
  } else if (next === "/settings") {
    // Settings is where the calendar button lives, so arriving from there
    // with no refresh token means the grant did not include offline access
    // — worth saying, rather than returning to an unchanged screen.
    calendarError = "Google returned no refresh token";
  }

  const target = new URL(`${origin}${next}`);
  if (calendarError) target.searchParams.set("calendar_error", calendarError);

  const response = NextResponse.redirect(target);
  response.cookies.delete(NEXT_COOKIE);
  return response;
}
