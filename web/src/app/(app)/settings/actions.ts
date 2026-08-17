"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { syncCalendars } from "@/lib/gcal";

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


export interface SyncResult {
  error?: string;
  imported?: number;
  removed?: number;
}

/**
 * Runs the calendar sync on demand.
 *
 * The cron already does this every quarter hour, but a first connection is
 * exactly when somebody needs to know whether it worked — and waiting up to
 * fifteen minutes for silence is not an answer. Being able to press it and
 * read a number is what makes the setup checkable.
 *
 * The admin client is required because calendar_connections is unreadable
 * from any browser-facing role, so the session is checked here instead.
 */
export async function syncCalendarNow(): Promise<SyncResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  try {
    const db = createAdminClient();
    const report = await syncCalendars(
      db,
      new Date(),
      session.household.timezone || "Asia/Jerusalem",
    );

    if (report.connections === 0) {
      return { error: "היומן לא מחובר. לחצו «חיבור יומן גוגל» קודם." };
    }
    if (report.failed > 0) {
      return { error: "הסנכרון נכשל. הפירוט מופיע בכרטיס למעלה אחרי רענון." };
    }
    return { imported: report.upserted, removed: report.deleted };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "הסנכרון נכשל." };
  }
}
