import webpush from "web-push";
import { createECDH } from "node:crypto";
import { RRule } from "rrule";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedDate, zonedTimeToInstant } from "@/lib/calendar";
import { israeliHolidays } from "@/lib/holidays";

/* ============================================================
   The notification pipeline, run by the cron.

   Four producers write into the `notifications` outbox, then one sender
   drains it. Producers are idempotent: each row carries a dedupe_key, so
   running the cron twice over the same window is a no-op rather than a
   double notification.
   ============================================================ */

/** How far ahead recurring occurrences are materialised. */
const HORIZON_DAYS = 60;

/**
 * How long a notification stays worth delivering.
 *
 * This is not housekeeping — it is what keeps the outbox from starving.
 * Delivery is push-only by choice, so a member who never ran "Add to Home
 * Screen" has no subscription and every notification addressed to them stays
 * queued for ever. Those rows accumulate, and since sendPending reads a
 * bounded page they would eventually crowd out today's real reminders.
 *
 * A "one hour before" reminder delivered a day late is noise anyway, so
 * anything past the window stops being retried. It is not deleted and not
 * marked sent — R9 wants a missed reminder to remain findable.
 */
const STALE_HOURS = 24;

export interface CronReport {
  holidaysSynced: number;
  occurrencesMaterialised: number;
  queued: number;
  sent: number;
  skippedQuiet: number;
  skippedPreference: number;
  /** Queued for a member with no device — the expected push-only steady state. */
  noSubscription: number;
  /** A push was attempted and the service rejected it. */
  failed: number;
  /** Too old to be worth sending; left in place, unsent, as a record. */
  expired: number;
  prunedSubscriptions: number;
}

type Db = SupabaseClient;

/* ---------------------------------------------------------------- */
/* 0. Jewish and Israeli holidays -> events                          */
/* ---------------------------------------------------------------- */

/** Keeps roughly this far ahead, so next Pesach is always already there. */
const HOLIDAY_YEARS_AHEAD = 1;

/**
 * C9 — writes the holidays into `events` as real rows.
 *
 * Real rows for the same reason birthdays are: reminders hang off an
 * `event_id`, so a holiday computed only at render time could never
 * produce the 10:30 notice R3 asks for.
 *
 * It runs from the cron rather than at signup because the set has to keep
 * extending — a household created today needs 2028's holidays in 2027.
 * The upsert makes re-running free.
 */
export async function syncHolidays(
  db: Db,
  now: Date,
  timeZone: string,
): Promise<number> {
  const { data: households } = await db.from("households").select("id");
  if (!households?.length) return 0;

  const thisYear = zonedDate(now, timeZone).getFullYear();
  const holidays = israeliHolidays(thisYear, thisYear + HOLIDAY_YEARS_AHEAD);
  if (!holidays.length) return 0;

  let written = 0;
  for (const household of households as { id: string }[]) {
    const rows = holidays.map((h) => ({
      household_id: household.id,
      kind: "holiday",
      title: h.title,
      // Midnight in the household's zone, matching how birthdays are
      // stored — the 10:30 rule reads the date back out in that zone.
      starts_at: zonedTimeToInstant(`${h.date}T00:00`, timeZone).toISOString(),
      all_day: true,
      reminders_on: h.remind,
      holiday_key: h.key,
    }));

    const { error } = await db
      .from("events")
      .upsert(rows, { onConflict: "household_id,holiday_key", ignoreDuplicates: true });
    if (!error) written += rows.length;
  }

  return written;
}

/* ---------------------------------------------------------------- */
/* 1. recurring events -> event_reminders                            */
/* ---------------------------------------------------------------- */

interface EventRow {
  id: string;
  household_id: string;
  kind: string;
  title: string;
  starts_at: string;
  rrule: string | null;
  reminders_on: boolean;
}

/**
 * Closes the gap R7b describes: rebuild_event_reminders only schedules the
 * row's own starts_at, so a weekly event was reminded once, ever. Here each
 * occurrence inside the horizon gets its own reminder rows.
 */
export async function materialiseRecurring(
  db: Db,
  now: Date,
  timeZone: string,
): Promise<number> {
  const { data: events } = await db
    .from("events")
    .select("id,household_id,kind,title,starts_at,rrule,reminders_on")
    .not("rrule", "is", null)
    .eq("reminders_on", true)
    .returns<EventRow[]>();

  if (!events?.length) return 0;

  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  let written = 0;

  for (const event of events) {
    const recipients = await recipientsFor(db, event.id, event.household_id);
    if (!recipients.length) continue;

    const base = new Date(event.starts_at);
    let occurrences: Date[];
    try {
      const options = RRule.parseString((event.rrule ?? "").replace(/^RRULE:/, ""));
      occurrences = new RRule({ ...options, dtstart: base }).between(now, horizon, true);
    } catch {
      continue; // a malformed rule must not stall the whole run
    }

    const rows: Record<string, unknown>[] = [];
    for (const utc of occurrences) {
      // rrule works in UTC; re-apply the base wall-clock so a 17:00 event
      // stays 17:00 across a DST change.
      const local = zonedDate(base, timeZone);
      const occurrence = new Date(
        Date.UTC(
          utc.getUTCFullYear(),
          utc.getUTCMonth(),
          utc.getUTCDate(),
          local.getHours(),
          local.getMinutes(),
        ),
      );
      // Convert that wall-clock back to a real instant in the household zone.
      const offset =
        zonedDate(occurrence, timeZone).getTime() -
        Date.UTC(
          occurrence.getUTCFullYear(),
          occurrence.getUTCMonth(),
          occurrence.getUTCDate(),
          occurrence.getUTCHours(),
          occurrence.getUTCMinutes(),
        );
      const instant = new Date(occurrence.getTime() - offset);

      const dayOf = event.kind === "birthday" || event.kind === "holiday";
      const schedule = dayOf
        ? [{ kind: "day_of_1030", at: atLocalTime(instant, timeZone, 10, 30) }]
        : [
            { kind: "lead_24h", at: new Date(instant.getTime() - 86_400_000) },
            { kind: "lead_1h", at: new Date(instant.getTime() - 3_600_000) },
          ];

      for (const member_id of recipients) {
        for (const s of schedule) {
          if (s.at < now) continue; // already past; nothing to schedule
          rows.push({
            event_id: event.id,
            member_id,
            kind: s.kind,
            occurrence_at: instant.toISOString(),
            fire_at: s.at.toISOString(),
          });
        }
      }
    }

    if (rows.length) {
      const { error } = await db
        .from("event_reminders")
        .upsert(rows, { onConflict: "event_id,member_id,kind,occurrence_at", ignoreDuplicates: true });
      if (!error) written += rows.length;
    }
  }

  return written;
}

/** Both parents, plus anyone the event actually concerns. Mirrors the SQL. */
async function recipientsFor(
  db: Db,
  eventId: string,
  householdId: string,
): Promise<string[]> {
  const [{ data: parents }, { data: participants }, { data: appt }] = await Promise.all([
    db.from("members").select("id").eq("household_id", householdId).eq("role", "parent"),
    db.from("event_participants").select("member_id").eq("event_id", eventId),
    db.from("appointments").select("patient_id").eq("event_id", eventId).maybeSingle(),
  ]);

  const ids = new Set<string>();
  for (const p of parents ?? []) ids.add((p as { id: string }).id);
  for (const p of participants ?? []) ids.add((p as { member_id: string }).member_id);
  if (appt) ids.add((appt as { patient_id: string }).patient_id);
  return [...ids];
}

function atLocalTime(instant: Date, timeZone: string, h: number, m: number): Date {
  const civil = zonedDate(instant, timeZone);
  civil.setHours(h, m, 0, 0);
  const asUtc = Date.UTC(
    civil.getFullYear(), civil.getMonth(), civil.getDate(), civil.getHours(), civil.getMinutes(),
  );
  const probe = new Date(asUtc);
  const offset = zonedDate(probe, timeZone).getTime() - asUtc;
  return new Date(asUtc - offset);
}

/* ---------------------------------------------------------------- */
/* 2. producers -> notifications outbox                              */
/* ---------------------------------------------------------------- */

const KIND_FOR_EVENT: Record<string, string> = {
  appointment: "appointment",
  birthday: "birthday",
  holiday: "birthday",
  general: "event",
  school: "event",
  reminder: "event",
};

const LEAD_LABEL: Record<string, string> = {
  lead_24h: "מחר",
  lead_1h: "בעוד שעה",
  day_of_1030: "היום",
};

/** Due event reminders become outbox rows. */
export async function queueEventNotifications(db: Db, now: Date): Promise<number> {
  const { data } = await db
    .from("event_reminders")
    .select("id,member_id,kind,fire_at,occurrence_at,events(id,title,kind,location)")
    .is("sent_at", null)
    .lte("fire_at", now.toISOString())
    .limit(500);

  if (!data?.length) return 0;

  const rows = data.map((r) => {
    const rec = r as unknown as {
      id: string; member_id: string; kind: string; fire_at: string; occurrence_at: string;
      events: { id: string; title: string; kind: string; location: string | null } | null;
    };
    const ev = rec.events;
    return {
      member_id: rec.member_id,
      kind: KIND_FOR_EVENT[ev?.kind ?? "general"] ?? "event",
      title: ev?.title ?? "תזכורת",
      body: [LEAD_LABEL[rec.kind], ev?.location].filter(Boolean).join(" · "),
      url: "/calendar",
      fire_at: rec.fire_at,
      dedupe_key: `event:${rec.id}`,
    };
  });

  await db.from("notifications").upsert(rows, {
    onConflict: "member_id,dedupe_key",
    ignoreDuplicates: true,
  });

  // The event_reminders row has done its job once it is in the outbox.
  await db
    .from("event_reminders")
    .update({ sent_at: now.toISOString() })
    .in("id", data.map((r) => (r as unknown as { id: string }).id));

  return rows.length;
}

/** R11 — a task's deadline, and a nudge once it has passed. */
export async function queueTaskNotifications(
  db: Db,
  now: Date,
  timeZone: string,
): Promise<number> {
  const soon = new Date(now.getTime() + 3_600_000);

  const { data } = await db
    .from("tasks")
    .select("id,title,assignee_id,due_at,status")
    .not("due_at", "is", null)
    .not("assignee_id", "is", null)
    .in("status", ["open", "in_progress"])
    .lte("due_at", soon.toISOString())
    .limit(200);

  if (!data?.length) return 0;

  const rows = (data as { id: string; title: string; assignee_id: string; due_at: string }[])
    .map((t) => {
      const due = new Date(t.due_at);
      const overdue = due < now;
      // One key per task per phase, so the same task never notifies twice
      // for the same reason however often the cron runs.
      return {
        member_id: t.assignee_id,
        kind: "task",
        title: t.title,
        body: overdue
          ? "עבר תאריך היעד"
          : `להשלמה עד ${zonedDate(due, timeZone).getHours()}:${String(
              zonedDate(due, timeZone).getMinutes(),
            ).padStart(2, "0")}`,
        url: "/tasks",
        fire_at: (overdue ? now : new Date(due.getTime() - 3_600_000)).toISOString(),
        dedupe_key: `task:${t.id}:${overdue ? "overdue" : "due"}`,
      };
    });

  await db.from("notifications").upsert(rows, {
    onConflict: "member_id,dedupe_key",
    ignoreDuplicates: true,
  });
  return rows.length;
}

/** R12 — one morning message per member, at their configured hour. */
export async function queueDigest(db: Db, now: Date, timeZone: string): Promise<number> {
  const today = zonedDate(now, timeZone);
  const dayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

  const { data: prefs } = await db
    .from("notification_preferences")
    .select("member_id,digest,digest_at")
    .eq("digest", true);

  if (!prefs?.length) return 0;

  const rows: Record<string, unknown>[] = [];

  for (const p of prefs as { member_id: string; digest_at: string }[]) {
    const [h, m] = p.digest_at.split(":").map(Number);
    const fire = atLocalTime(now, timeZone, h, m ?? 0);
    if (fire > now) continue; // not yet this morning

    const { count: taskCount } = await db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assignee_id", p.member_id)
      .in("status", ["open", "in_progress"]);

    rows.push({
      member_id: p.member_id,
      kind: "digest",
      title: "הבוקר שלך",
      body: taskCount
        ? `${taskCount} משימות פתוחות. לחצו לפרטים.`
        : "אין משימות פתוחות היום.",
      url: "/home",
      fire_at: fire.toISOString(),
      dedupe_key: `digest:${dayKey}`,
    });
  }

  if (rows.length) {
    await db.from("notifications").upsert(rows, {
      onConflict: "member_id,dedupe_key",
      ignoreDuplicates: true,
    });
  }
  return rows.length;
}

/* ---------------------------------------------------------------- */
/* 3. sender — preferences, quiet hours, delivery                    */
/* ---------------------------------------------------------------- */

interface Prefs {
  member_id: string;
  appointments: boolean;
  events: boolean;
  birthdays: boolean;
  tasks: boolean;
  shopping: boolean;
  digest: boolean;
  quiet_from: string;
  quiet_to: string;
}

const PREF_FOR_KIND: Record<string, keyof Prefs> = {
  appointment: "appointments",
  event: "events",
  birthday: "birthdays",
  task: "tasks",
  shopping: "shopping",
  digest: "digest",
};

/**
 * True when `at` falls inside the member's quiet window.
 *
 * Handles the wrap-around case, which is the normal one: 22:00–07:00 spans
 * midnight, so a naive from<=t<=to comparison would never match.
 */
export function inQuietHours(
  at: Date,
  timeZone: string,
  from: string,
  to: string,
): boolean {
  const local = zonedDate(at, timeZone);
  const minutes = local.getHours() * 60 + local.getMinutes();
  const parse = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const f = parse(from);
  const t = parse(to);
  return f <= t ? minutes >= f && minutes < t : minutes >= f || minutes < t;
}

/**
 * Whether a rejected push means *this subscription* is finished.
 *
 * 404 and 410 are unambiguous: the push service has thrown the
 * subscription away. A refused token is not, and the difference matters
 * because acting on it wrongly deletes every device in the family.
 *
 * A subscription is bound to the application key it was created with. Push
 * to it with a different pair and Apple answers `badJwtToken` — the same
 * words it uses when the server's own keys are nonsense. Read alone, the
 * rejection cannot tell those apart. But the server's key pair can be
 * checked directly, and once it is known to be sound, a token refused for
 * one endpoint can only mean that endpoint predates the current key. That
 * is permanent, and it will not resolve itself: nothing here would ever
 * clear it, so the cron would retry it at every run for ever.
 *
 * When the pair does not verify, nothing is deleted. The fault is the
 * configuration's, the same for every device, and throwing away the whole
 * family's registrations over it would turn a five-minute fix into an
 * evening of asking four people to press a button again.
 */
export function isDeadSubscription(err: unknown, serverKeysAreSound: boolean): boolean {
  const status = (err as { statusCode?: number }).statusCode;
  if (status === 404 || status === 410) return true;
  if (!serverKeysAreSound) return false;
  if (status !== 400 && status !== 403) return false;
  // Each push service words this differently. Apple says `BadJwtToken`;
  // Chrome says the key in the Authorization header does not match the one
  // the subscription was made with. Both mean the same thing, and matching
  // only one of them leaves half the family's devices retrying for ever.
  const body = String((err as { body?: string }).body ?? "");
  return /badjwttoken|vapid|application server key|unauthorized|authorization header/i.test(body);
}

export async function sendPending(
  db: Db,
  now: Date,
  timeZone: string,
  report: CronReport,
): Promise<void> {
  const keysAreSound = vapidKeyVerdict() === "ok";

  // Stop retrying what is too old to be useful. The rows are *not* marked
  // sent — R9 wants a missed reminder to stay findable, and writing sent_at
  // would claim it was delivered. They keep sent_at null, which is the honest
  // record, and simply drop out of the window the sender reads.
  const stale = new Date(now.getTime() - STALE_HOURS * 3_600_000).toISOString();
  const { count: expiredCount } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("sent_at", null)
    .lt("fire_at", stale);
  report.expired = expiredCount ?? 0;

  const { data: pending } = await db
    .from("notifications")
    .select("id,member_id,kind,title,body,url,fire_at")
    .is("sent_at", null)
    .gte("fire_at", stale)
    .lte("fire_at", now.toISOString())
    .order("fire_at", { ascending: true })
    .limit(200);

  if (!pending?.length) return;

  const memberIds = [...new Set(pending.map((n) => (n as { member_id: string }).member_id))];

  const [{ data: prefRows }, { data: subs }] = await Promise.all([
    db.from("notification_preferences").select("*").in("member_id", memberIds),
    db.from("push_subscriptions").select("*").in("member_id", memberIds),
  ]);

  const prefsBy = new Map((prefRows as Prefs[] ?? []).map((p) => [p.member_id, p]));
  const subsBy = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of (subs ?? []) as { id: string; member_id: string; endpoint: string; p256dh: string; auth: string }[]) {
    const list = subsBy.get(s.member_id) ?? [];
    list.push(s);
    subsBy.set(s.member_id, list);
  }

  const sentIds: string[] = [];
  const deadSubs: string[] = [];

  for (const raw of pending) {
    const n = raw as { id: string; member_id: string; kind: string; title: string; body: string | null; url: string | null };
    const prefs = prefsBy.get(n.member_id);

    if (prefs && prefs[PREF_FOR_KIND[n.kind]] === false) {
      // Opted out. Marked sent so it does not sit in the queue for ever.
      sentIds.push(n.id);
      report.skippedPreference++;
      continue;
    }

    // A quiet-hours hit is held, not dropped — it goes out when the window
    // ends, which is why it is neither marked sent nor deleted here.
    if (prefs && inQuietHours(now, timeZone, prefs.quiet_from, prefs.quiet_to)) {
      report.skippedQuiet++;
      continue;
    }

    const targets = subsBy.get(n.member_id) ?? [];
    if (!targets.length) {
      // Not a failure: they simply have no device registered. Left queued so
      // it still arrives if they install within the window; STALE_HOURS
      // clears it if they do not.
      report.noSubscription++;
      continue;
    }

    let delivered = false;
    for (const sub of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url ?? "/home" }),
        );
        delivered = true;
      } catch (err) {
        if (isDeadSubscription(err, keysAreSound)) deadSubs.push(sub.id);
        report.failed++;
      }
    }

    if (delivered) {
      sentIds.push(n.id);
      report.sent++;
    }
  }

  if (sentIds.length) {
    await db.from("notifications").update({ sent_at: now.toISOString() }).in("id", sentIds);
  }
  if (deadSubs.length) {
    await db.from("push_subscriptions").delete().in("id", deadSubs);
    report.prunedSubscriptions = deadSubs.length;
  }
}

export function configureWebPush(): boolean {
  // Trimmed. A value pasted with a trailing newline is not empty, so it
  // passes every "is it set" check and then signs badly, and the only
  // symptom is the push service rejecting the token.
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    (process.env.VAPID_SUBJECT || "mailto:family@example.com").trim(),
    publicKey,
    privateKey,
  );
  return true;
}

export type VapidKeyVerdict = "ok" | "missing" | "malformed" | "not-a-pair";

/**
 * Whether the two configured keys are actually two halves of one key.
 *
 * When a push is refused, the message names the token — Apple says
 * `badJwtToken` — and every explanation for that sounds equally plausible
 * from the outside: wrong key, stale subscription, bad clock, wrong
 * subject. This settles one of them without asking anybody anything.
 *
 * A VAPID pair is ECDSA P-256. The private half is the scalar, the public
 * half is the uncompressed point, and the point can be recomputed from the
 * scalar — so two values that claim to be a pair can simply be checked.
 * Mixing the public key of one generation with the private key of another
 * is easy to do and impossible to see, since both look like the right kind
 * of gibberish.
 */
export function vapidKeyVerdict(): VapidKeyVerdict {
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) return "missing";

  try {
    const priv = Buffer.from(privateKey, "base64url");
    const pub = Buffer.from(publicKey, "base64url");
    if (priv.length !== 32 || pub.length !== 65 || pub[0] !== 0x04) return "malformed";

    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub) ? "ok" : "not-a-pair";
  } catch {
    return "malformed";
  }
}
