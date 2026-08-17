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

/**
 * Corrects a member row. Until this existed a mistyped birth date was
 * permanent from inside the app: there was an add form and an invite
 * button and nothing else, so a wrong year could only be fixed by hand in
 * the database.
 *
 * birth_date matters beyond the label. The members trigger derives the
 * birthday event from it, so saving the right date here also moves the
 * calendar entry and rebuilds its 10:30 reminder.
 */
export async function updateMember(
  _prev: FamilyState,
  formData: FormData,
): Promise<FamilyState> {
  const session = await getSession();
  if (!session) return { error: "פג תוקף החיבור. התחברו מחדש." };
  if (session.member.role !== "parent") {
    return { error: "רק הורה יכול לערוך בני משפחה." };
  }

  const id = String(formData.get("member_id") ?? "").trim();
  const displayName = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const color = String(formData.get("color") ?? DEFAULT_COLOR);
  const birthDate = String(formData.get("birth_date") ?? "").trim();

  const target = session.members.find((m) => m.id === id);
  if (!target) return { error: "בן המשפחה לא נמצא." };
  if (!displayName) return { error: "צריך למלא שם." };
  if (role !== "parent" && role !== "child") return { error: "תפקיד לא מוכר." };

  // Demoting the only parent would leave nobody able to invite, add or edit
  // — including undoing this very change.
  if (target.role === "parent" && role !== "parent") {
    const parents = session.members.filter((m) => m.role === "parent").length;
    if (parents <= 1) {
      return { error: "צריך שיישאר לפחות הורה אחד." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({
      display_name: displayName,
      role,
      color,
      birth_date: birthDate || null,
    })
    .eq("id", id);

  if (error) return { error: "השמירה נכשלה. נסו שוב." };

  revalidatePath("/family");
  revalidatePath("/home");
  revalidatePath("/calendar");
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
