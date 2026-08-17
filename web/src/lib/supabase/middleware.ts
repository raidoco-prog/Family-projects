import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";
import { NEXT_COOKIE, safePath } from "../next-path";

/**
 * Paths reachable without a session.
 *
 * /api/cron is here because pg_cron has no cookie to present — it
 * authenticates with a bearer secret the route checks itself. Without this
 * the cron would be redirected to the login page and never run.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/join", "/setup", "/api/cron"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Without credentials there is nothing to protect — send everything to
  // the setup guide instead of failing on every request.
  if (!isSupabaseConfigured) {
    if (pathname === "/setup") return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() revalidates against Supabase. getSession() only reads the
  // cookie, which a client could forge — never gate access on it.
  //
  // A network failure here must not 500 every page in the app. Treating
  // it as "no session" degrades to the login screen, which is public and
  // therefore cannot loop.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  // Belt and braces for a misconfigured Redirect URL list. When Supabase
  // cannot match redirectTo it substitutes the Site URL, which lands an
  // invited member on the app root — and with no member row that is the
  // "create a household" screen, in the middle of accepting an invitation.
  // The destination is still in the cookie, so honour it instead.
  if (user && (pathname === "/" || pathname === "/onboarding")) {
    const pending = request.cookies.get(NEXT_COOKIE)?.value;
    const target = pending ? safePath(decodeURIComponent(pending), "") : "";
    if (target.startsWith("/join/")) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Reaching the invite means the rescue above has done its job. Dropping
  // the cookie here keeps it to a single bounce, so somebody who really
  // does want to start a household is not sent back a second time.
  if (pathname.startsWith("/join/") && request.cookies.has(NEXT_COOKIE)) {
    response.cookies.delete(NEXT_COOKIE);
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
