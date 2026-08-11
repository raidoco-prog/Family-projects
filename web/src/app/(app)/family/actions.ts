"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { DEFAULT_COLOR } from "@/lib/palette";
import type { HouseholdInvite } from "@/lib/types";

export interface FamilyState {
  error?: string;
  inviteUrl?: string;
}

/**
 * Adds a family member row with no account attached. A child can be
 * managed — given appointments, tasks, a colour — long before they have
 * a login, or without ever having one.
 */
export async function addMember(
  _prev: FamilyState,
  formData: FormData,
): Promise<FamilyState> {
  const session = await getSession();
  if (!session) return { error: "פג תוקף החיבור. התחברו מחדש." };
  if (session.member.role !== "parent") {
    return { error: "רק הורה יכול להוסיף בני משפחה." };
  }

  const displayName = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "child");
  const color = String(formData.get("color") ?? DEFAULT_COLOR);
  const birthDate = String(formData.get("birth_date") ?? "").trim();

  if (!displayName) return { error: "צריך למלא שם." };
  if (role !== "parent" && role !== "child") return { error: "תפקיד לא מוכר." };

  const supabase = await createClient();
  const { error } = await supabase.from("members").insert({
    household_id: session.household.id,
    display_name: displayName,
    role,
    color,
    birth_date: birthDate || null,
  });

  if (error) return { error: "הוספת בן המשפחה נכשלה. נסו שוב." };

  revalidatePath("/family");
  revalidatePath("/home");
  return {};
}

/** Creates a single-use link that binds the opener to one member row. */
export async function createInvite(
  _prev: FamilyState,
  formData: FormData,
): Promise<FamilyState> {
  const session = await getSession();
  if (!session) return { error: "פג תוקף החיבור. התחברו מחדש." };
  if (session.member.role !== "parent") {
    return { error: "רק הורה יכול להזמין." };
  }

  const memberId = String(formData.get("member_id") ?? "").trim();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("household_invites")
    .insert({
      household_id: session.household.id,
      member_id: memberId || null,
      created_by: session.member.id,
    })
    .select("token")
    .single<Pick<HouseholdInvite, "token">>();

  if (error || !data) return { error: "יצירת ההזמנה נכשלה. נסו שוב." };

  revalidatePath("/family");
  return { inviteUrl: `/join/${data.token}` };
}
