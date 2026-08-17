/**
 * One-way Google Calendar sync: Google → the app.
 *
 * Google owns *when and what* — the title, the times, the place, the
 * recurrence. The app owns the *classification*: whether a row is an
 * appointment, who it concerns, whether it nags. A sync therefore updates
 * the first group and never touches the second, so re-running it cannot
 * undo the work of turning an imported row into a real appointment.
 *
 * Nothing here is written back to Google. Two-way sync needs a conflict
 * policy for "both sides changed the same event", and there is no honest
 * answer to that which does not sometimes lose an edit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedTimeToInstant } from "./calendar";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_URL = "https://www.googleapis.com/calendar/v3/calendars";

export interface GoogleTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  recurrence?: string[];
  recurringEventId?: string;
  eventType?: string;
}

export interface EventRow {
  external_key: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  rrule: string | null;
}

export interface CalendarReport {
  connections: number;
  upserted: number;
  deleted: number;
  fullResyncs: number;
  failed: number;
}

/** A refresh token buys a short-lived access token, and nothing else. */
export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    // Both halves, and the code first. Google's prose does not always name
    // the fault — a dead client answers "The OAuth client was not found."
    // with the code invalid_client — and dropping the code makes a
    // permanent failure look transient enough to retry every 15 minutes
    // for as long as the cron lives.
    const parts = [body.error, body.error_description].filter(Boolean);
    throw new Error(parts.length ? parts.join(": ") : `token ${res.status}`);
  }
  return body.access_token;
}

/**
 * Marks a token that can never succeed again, so the caller stores the
 * failure and stops rather than retrying every quarter hour forever.
 */
export function isPermanentAuthFailure(message: string): boolean {
  return /invalid_grant|invalid_client|unauthorized_client/i.test(message);
}

/** RFC 5545 allows several lines; only the RRULE is ours to keep. */
export function rruleFrom(recurrence?: string[]): string | null {
  const line = recurrence?.find((r) => r.startsWith("RRULE:"));
  return line ? line.slice("RRULE:".length) : null;
}

/**
 * Google returns all-day events as a bare date, which has no instant until
 * a zone is applied. Applying the household's zone is what keeps a birthday
 * on the right square of the calendar for a family in Israel.
 */
export function toEventRow(ev: GoogleEvent, timeZone: string): EventRow | null {
  const start = ev.start;
  if (!start) return null;

  const allDay = Boolean(start.date);
  const startsAt = allDay
    ? zonedTimeToInstant(`${start.date}T00:00`, timeZone)
    : start.dateTime
      ? new Date(start.dateTime)
      : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return null;

  const end = ev.end;
  const endsAt = allDay
    ? end?.date
      ? zonedTimeToInstant(`${end.date}T00:00`, timeZone)
      : null
    : end?.dateTime
      ? new Date(end.dateTime)
      : null;

  return {
    external_key: `gcal:${ev.id}`,
    title: ev.summary?.trim() || "(ללא כותרת)",
    description: ev.description?.trim() || null,
    location: ev.location?.trim() || null,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt.toISOString() : null,
    all_day: allDay,
    rrule: rruleFrom(ev.recurrence),
  };
}

/**
 * Skips what a shared family calendar has no use for: the working-location
 * blocks Google inserts on its own, and the individual instances of a
 * recurring event — the master carries the RRULE, which is the app's model.
 */
export function isSyncable(ev: GoogleEvent): boolean {
  if (ev.eventType === "workingLocation") return false;
  if (ev.recurringEventId) return false;
  return true;
}

interface ListResult {
  events: GoogleEvent[];
  nextSyncToken?: string;
  expired?: boolean;
}

/**
 * A sync token asks Google for "what changed since last time". It expires,
 * and Google says so with 410 — the only correct response is to forget it
 * and read the window again from scratch.
 */
export async function listChanges(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
  timeMin: string,
): Promise<ListResult> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params = new URLSearchParams({ maxResults: "250", singleEvents: "false" });
    if (syncToken) params.set("syncToken", syncToken);
    else params.set("timeMin", timeMin);
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${CALENDAR_URL}/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (res.status === 410) return { events: [], expired: true };
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`calendar ${res.status} ${detail.slice(0, 200)}`);
    }

    const body = (await res.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    nextSyncToken = body.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

interface Connection {
  member_id: string;
  refresh_token: string;
  calendar_id: string;
  sync_token: string | null;
}

/** Runs every connected calendar. One failure must not stop the others. */
export async function syncCalendars(
  db: SupabaseClient,
  now: Date,
  timeZone: string,
): Promise<CalendarReport> {
  const report: CalendarReport = {
    connections: 0,
    upserted: 0,
    deleted: 0,
    fullResyncs: 0,
    failed: 0,
  };

  const { data: connections } = await db
    .from("calendar_connections")
    .select("member_id,refresh_token,calendar_id,sync_token");

  if (!connections?.length) return report;
  report.connections = connections.length;

  // Six months back is enough to carry this year's recurring masters
  // without dragging in a decade of history on the first run.
  const timeMin = new Date(now.getTime() - 183 * 24 * 3600 * 1000).toISOString();

  for (const conn of connections as Connection[]) {
    try {
      const { data: member } = await db
        .from("members")
        .select("household_id")
        .eq("id", conn.member_id)
        .single<{ household_id: string }>();
      if (!member) continue;

      const token = await accessTokenFrom(conn.refresh_token);

      let result = await listChanges(token, conn.calendar_id, conn.sync_token, timeMin);
      if (result.expired) {
        report.fullResyncs += 1;
        result = await listChanges(token, conn.calendar_id, null, timeMin);
      }

      const gone = result.events.filter((e) => e.status === "cancelled");
      const live = result.events.filter(
        (e) => e.status !== "cancelled" && isSyncable(e),
      );

      if (gone.length) {
        const { count } = await db
          .from("events")
          .delete({ count: "exact" })
          .eq("household_id", member.household_id)
          .in("external_key", gone.map((e) => `gcal:${e.id}`));
        report.deleted += count ?? 0;
      }

      const rows = live
        .map((e) => toEventRow(e, timeZone))
        .filter((r): r is EventRow => r !== null)
        .map((r) => ({ ...r, household_id: member.household_id }));

      if (rows.length) {
        // kind, reminders_on and the participant links are deliberately
        // absent: those are the app's, and an upsert must not reset them.
        const { error } = await db
          .from("events")
          .upsert(rows, { onConflict: "household_id,external_key" });
        if (error) throw new Error(error.message);
        report.upserted += rows.length;
      }

      await db
        .from("calendar_connections")
        .update({
          sync_token: result.nextSyncToken ?? null,
          last_synced_at: now.toISOString(),
          last_error: null,
        })
        .eq("member_id", conn.member_id);
    } catch (err) {
      report.failed += 1;
      const message = err instanceof Error ? err.message : "sync failed";
      await db
        .from("calendar_connections")
        .update({
          last_error: message,
          // A revoked token will never work again. Clearing the sync token
          // means that if the user reconnects, the next run reads the whole
          // window instead of resuming from a point Google has forgotten.
          ...(isPermanentAuthFailure(message) ? { sync_token: null } : {}),
        })
        .eq("member_id", conn.member_id);
    }
  }

  return report;
}
