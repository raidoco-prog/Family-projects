"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { syncCalendars } from "@/lib/gcal";
import { configureWebPush } from "@/lib/notifications";
import webpush from "web-push";

export interface ActionResult {
  error?: string;
}

const EXPIRED = "פג תוקף החיבור. התחברו מחדש.";

export interface SaveDeviceResult {
  error?: string;
  devices?: number;
}

/**
 * Registers this browser as somewhere reminders can be delivered.
 *
 * Through a database function rather than a table write, because the table
 * write could not do the job from a browser role. It was an upsert on the
 * endpoint, and two things stopped it, both silently:
 *
 *   Postgres checks UPDATE privilege on any ON CONFLICT DO UPDATE at plan
 *   time, whether or not a row actually conflicts — and the browser role
 *   was granted select, insert and delete only. Every registration was
 *   refused, on the first attempt, with nothing conflicting.
 *
 *   And when a row for the endpoint did exist under another member — one
 *   phone, two accounts, which happens while invitations are being sorted
 *   out — row-level security rejected the update outright, as it should.
 *
 * A push endpoint names one browser on one device, and it is obtainable
 * only from that browser. Whoever is signed in there now is who its
 * reminders belong to, so the function takes the endpoint over rather than
 * treating a leftover row as a competing claim.
 */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}): Promise<SaveDeviceResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_push_device", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: sub.userAgent.slice(0, 300),
  });

  if (error) {
    // The raw text, always. Every version of this failure looked the same
    // from the phone — notifications reported as on, nothing registered,
    // no reminders — and a sentence saying "try again" is what kept the
    // cause invisible for as long as it was.
    const missing = error.code === "42883" || /claim_push_device/.test(error.message);
    return {
      error: missing
        ? "פונקציית הרישום חסרה במסד. הריצו את docs/fix-push-registration.sql ב-Supabase."
        : `שמירת המכשיר נכשלה: ${error.message}`,
    };
  }

  revalidatePath("/settings");
  return { devices: typeof data === "number" ? data : undefined };
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


export interface TestPushResult {
  error?: string;
  sent?: number;
}

/**
 * Sends one notification to the caller's own devices, right now.
 *
 * Everything between pressing "enable" and a reminder actually arriving is
 * invisible: the subscription, the keys, the signing, Apple's push service,
 * the phone's own notification settings. Any one of them can be wrong and
 * the only symptom is a reminder that never comes — days later, with no way
 * to tell which link broke.
 *
 * This exercises the whole chain except the schedule, and reports what it
 * found. It can only ever reach the member making the request.
 */
export async function sendTestPush(): Promise<TestPushResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  if (!configureWebPush()) {
    return {
      error:
        "מפתחות ההתראות לא מוגדרים בשרת. ראו את הכרטיס «יצירת מפתחות ההתראות».",
    };
  }

  const db = createAdminClient();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("member_id", session.member.id);

  if (!subs?.length) {
    return {
      error: "אין מכשיר רשום. לחצו קודם «הפעלת התראות במכשיר הזה».",
    };
  }

  let sent = 0;
  const dead: string[] = [];
  let lastError = "";

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: "הבית שלנו",
          body: "בדיקה — ההתראות עובדות.",
          url: "/home",
        }),
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The browser discarded this subscription; keeping it would mean
      // failing forever against an endpoint that no longer exists.
      if (status === 404 || status === 410) dead.push(sub.id);
      lastError =
        (err as { body?: string }).body ||
        (err instanceof Error ? err.message : "שליחה נכשלה");
    }
  }

  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);

  if (sent === 0) {
    return {
      error: dead.length
        ? "הרישום של המכשיר פג. לחצו «הפעלת התראות במכשיר הזה» שוב."
        : `השליחה נכשלה: ${lastError}`,
    };
  }
  return { sent };
}
