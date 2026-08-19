import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, image files, and the two files the
    // browser fetches on its own behalf rather than the user's.
    //
    // sw.js belongs in that list and was missing from it. A signed-out
    // request for it was answered with a redirect to the login page, so
    // the service worker script arrived as HTML. Browsers re-fetch that
    // script to check for updates, and a fetch that returns the wrong
    // content type fails the update — which on iOS takes the push handler
    // with it. The push is then accepted by Apple and displayed by
    // nobody, which is indistinguishable from the notification never
    // having been sent.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
