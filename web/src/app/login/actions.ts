"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";

export interface LoginState {
  error?: string;
  sent?: string;
}

function safeNext(raw: FormData): string {
  const next = String(raw.get("next") ?? "");
  // Only same-origin paths — an absolute URL here would be an open redirect.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signInWithGoogle(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const supabase = await createClient();
  const next = safeNext(formData);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: "ההתחברות עם גוגל נכשלה. נסו שוב." };
  if (data.url) redirect(data.url);
  return { error: "ההתחברות עם גוגל נכשלה. נסו שוב." };
}

export async function signInWithEmail(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "צריך למלא כתובת אימייל." };

  const supabase = await createClient();
  const next = safeNext(formData);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: "שליחת הקישור נכשלה. בדקו את הכתובת ונסו שוב." };
  return { sent: email };
}
