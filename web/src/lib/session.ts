import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Household, Member, Session } from "@/lib/types";

/**
 * The signed-in user's member row, their household, and everyone in it.
 * Returns null when the user has no member row yet — that is the signal
 * to send them through onboarding.
 *
 * Wrapped in React's cache so one request pays for it once. The app layout
 * calls this and then so does every page inside it, and each call is three
 * round trips to Supabase — the session, the member row, then the
 * household and its members. Unmemoised that is six round trips per
 * navigation where three will do, and they are serial, so it is felt
 * directly as the delay before anything appears.
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
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
});
