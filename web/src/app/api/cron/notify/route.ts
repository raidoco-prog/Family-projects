import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  configureWebPush,
  materialiseRecurring,
  queueDigest,
  queueEventNotifications,
  queueTaskNotifications,
  sendPending,
  syncHolidays,
  type CronReport,
} from "@/lib/notifications";
import { syncCalendars, type CalendarReport } from "@/lib/gcal";

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
    holidaysSynced: 0,
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

  // Runs before the reminder pass so an event that arrived from Google in
  // this same tick already has its reminders built, instead of waiting a
  // further fifteen minutes. A calendar failure must not stop the
  // reminders, which is why it has its own try.
  let calendar: CalendarReport | { error: string };
  try {
    calendar = await syncCalendars(db, now, timeZone);
  } catch (err) {
    calendar = { error: err instanceof Error ? err.message : "calendar sync failed" };
  }

  try {
    // Before anything reads events: a holiday that is not a row yet cannot
    // get a reminder built for it.
    report.holidaysSynced = await syncHolidays(db, now, timeZone);
    report.occurrencesMaterialised = await materialiseRecurring(db, now, timeZone);
    report.queued =
      (await queueEventNotifications(db, now)) +
      (await queueTaskNotifications(db, now, timeZone)) +
      (await queueDigest(db, now, timeZone));
    await sendPending(db, now, timeZone, report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cron failed", report, calendar },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), ...report, calendar });
}
