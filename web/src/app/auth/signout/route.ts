import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // An invite can send you back here to sign in as someone else. Carrying
  // the destination through means the link still works after the switch,
  // instead of stranding you on a login screen with nothing to return to.
  const raw = String((await request.formData().catch(() => null))?.get("next") ?? "");
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";

  const url = new URL("/login", request.nextUrl.origin);
  if (next) url.searchParams.set("next", next);

  return NextResponse.redirect(url, { status: 303 });
}
