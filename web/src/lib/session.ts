import { createClient } from "@/lib/supabase/server";
import type { Household, Member, Session } from "@/lib/types";

/**
 * The signed-in user's member row, their household, and everyone in it.
 * Returns null when the user has no member row yet — that is the signal
 * to send them through onboarding.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Member>();
  if (!member) return null;

  // RLS already limits both queries to this household; the filters are
  // for clarity and to keep the payload small.
  const [{ data: household }, { data: members }] = await Promise.all([
    supabase
      .from("households")
      .select("*")
      .eq("id", member.household_id)
      .single<Household>(),
    supabase
      .from("members")
      .select("*")
      .eq("household_id", member.household_id)
      .order("created_at"),
  ]);

  if (!household) return null;

  return { member, household, members: (members as Member[]) ?? [] };
}
