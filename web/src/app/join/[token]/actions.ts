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
    // P0003 and 23505 are opposite problems and must not share wording.
    // P0003: this Google account already belongs to somebody else in the
    // house — almost always a shared phone still signed in as a parent,
    // and the fix is to switch accounts. 23505: the slot itself is gone.
    const message =
      error.code === "22023"
        ? "ההזמנה כבר נוצלה או שפג תוקפה. בקשו קישור חדש."
        : error.code === "P0003"
          ? "החשבון שאיתם נכנסתם כבר שייך לבן משפחה אחר בבית. " +
            "כנראה המכשיר מחובר לגוגל של מישהו אחר — לחצו «זה לא אני» " +
            "למעלה והתחברו עם החשבון שלכם."
          : error.code === "23505"
            ? "המקום הזה כבר נתפס."
            : "ההצטרפות נכשלה. נסו שוב.";
    return { error: message };
  }

  redirect("/home");
}
