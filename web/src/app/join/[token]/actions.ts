"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface JoinState {
  error?: string;
}

export async function claimInvite(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const token = String(formData.get("token") ?? "").trim();
  const displayName = String(formData.get("name") ?? "").trim();
  if (!token) return { error: "קישור ההזמנה חסר." };

  const supabase = await createClient();

  // claim_invite is security definer: the caller is not a household
  // member yet, so no RLS policy would let them touch these rows.
  const { error } = await supabase.rpc("claim_invite", {
    p_token: token,
    p_display_name: displayName || null,
  });

  if (error) {
    const message =
      error.code === "22023"
        ? "ההזמנה כבר נוצלה או שפג תוקפה. בקשו קישור חדש."
        : error.code === "23505"
          ? "המקום הזה כבר נתפס."
          : "ההצטרפות נכשלה. נסו שוב.";
    return { error: message };
  }

  redirect("/home");
}
