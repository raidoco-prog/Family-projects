import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  configureWebPush,
  materialiseRecurring,
  queueDigest,
  queueEventNotifications,
  queueTaskNotifications,
  sendPending,
  type CronReport,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Driven by pg_cron every 15 minutes.
 *
 * Vercel's free tier caps cron at once a day, which is useless for a "one
 * hour before" reminder, so the schedule lives in Postgres and calls this
 * route through pg_net. The shared secret is what stops anyone else from
 * doing the same.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!configureWebPush()) {
    return NextResponse.json({ error: "VAPID keys are not set" }, { status: 500 });
  }

  const db = createAdminClient();
  const now = new Date();

  const report: CronReport = {
    occurrencesMaterialised: 0,
    queued: 0,
    sent: 0,
    skippedQuiet: 0,
    skippedPreference: 0,
    noSubscription: 0,
    failed: 0,
    expired: 0,
    prunedSubscriptions: 0,
  };

  // One household for now; the timezone is read rather than assumed.
  const { data: household } = await db
    .from("households")
    .select("timezone")
    .limit(1)
    .maybeSingle<{ timezone: string }>();
  const timeZone = household?.timezone || "Asia/Jerusalem";

  try {
    report.occurrencesMaterialised = await materialiseRecurring(db, now, timeZone);
    report.queued =
      (await queueEventNotifications(db, now)) +
      (await queueTaskNotifications(db, now, timeZone)) +
      (await queueDigest(db, now, timeZone));
    await sendPending(db, now, timeZone, report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cron failed", report },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), ...report });
}
