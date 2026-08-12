"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export interface ActionResult {
  error?: string;
}

const EXPIRED = "פג תוקף החיבור. התחברו מחדש.";

export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      member_id: session.member.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );

  if (error) return { error: "שמירת המנוי נכשלה. נסו שוב." };
  revalidatePath("/settings");
  return {};
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { error: "הסרת המנוי נכשלה." };
  revalidatePath("/settings");
  return {};
}

export interface PreferenceUpdate {
  appointments?: boolean;
  events?: boolean;
  birthdays?: boolean;
  tasks?: boolean;
  shopping?: boolean;
  digest?: boolean;
  digest_at?: string;
  quiet_from?: string;
  quiet_to?: string;
}

export async function savePreferences(patch: PreferenceUpdate): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .update(patch)
    .eq("member_id", session.member.id);

  if (error) return { error: "שמירת ההעדפות נכשלה. נסו שוב." };
  revalidatePath("/settings");
  return {};
}
