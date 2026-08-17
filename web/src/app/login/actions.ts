"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";
import { NEXT_COOKIE, NEXT_COOKIE_MAX_AGE, safePath } from "@/lib/next-path";

export interface LoginState {
  error?: string;
  sent?: string;
}

export async function signInWithEmail(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "צריך למלא כתובת אימייל." };

  const safeNext = safePath(String(formData.get("next") ?? ""));

  // Same reason as the Google button: a query string on the redirect URL
  // has to be matched by the Supabase allow list, and when it is not, the
  // failure is a silent substitution rather than an error. HttpOnly here
  // because this side runs on the server and can afford it.
  (await cookies()).set(NEXT_COOKIE, encodeURIComponent(safeNext), {
    path: "/",
    maxAge: NEXT_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  // Supabase's own wording, not ours: the two failures that actually happen
  // here are a disabled Email provider and the built-in SMTP rate limit, and
  // a generic "try again" hides both.
  if (error) return { error: error.message };
  return { sent: email };
}
