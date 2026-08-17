import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return back(origin, error.message);

  return NextResponse.redirect(`${origin}${next}`);
}
