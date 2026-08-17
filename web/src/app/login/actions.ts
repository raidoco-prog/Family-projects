"use server";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";

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

  const next = String(formData.get("next") ?? "");
  // Only same-origin paths — an absolute URL here would be an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  });

  // Supabase's own wording, not ours: the two failures that actually happen
  // here are a disabled Email provider and the built-in SMTP rate limit, and
  // a generic "try again" hides both.
  if (error) return { error: error.message };
  return { sent: email };
}
