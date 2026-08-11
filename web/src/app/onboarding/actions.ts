"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_COLOR } from "@/lib/palette";

export interface OnboardingState {
  error?: string;
}

export async function createHousehold(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const householdName = String(formData.get("household") ?? "").trim();
  const displayName = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? DEFAULT_COLOR);
  const birthDate = String(formData.get("birth_date") ?? "").trim();

  if (!householdName) return { error: "צריך לתת שם למשק הבית." };
  if (!displayName) return { error: "צריך למלא את השם שלך." };

  const supabase = await createClient();

  // RLS blocks a plain INSERT here: the user has no household yet, so
  // current_household_ids() is empty. create_household is the security
  // definer entry point that handles exactly this case.
  const { error } = await supabase.rpc("create_household", {
    p_household_name: householdName,
    p_display_name: displayName,
    p_color: color,
    p_birth_date: birthDate || null,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "המשתמש הזה כבר משויך למשק בית."
          : "יצירת משק הבית נכשלה. נסו שוב.",
    };
  }

  redirect("/family");
}
