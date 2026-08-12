import { RRule } from "rrule";
import type { Appointment, CalendarEvent, Occurrence } from "@/lib/types";

export const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
export const DOW_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
export const DOW_LONG = [
  "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת",
];

/**
 * Converts an instant into a *civil* date in the given timezone.
 *
 * This exists because the calendar is server-rendered and then hydrated:
 * the server runs in UTC and the phone runs in Asia/Jerusalem, so anything
 * derived from `new Date(iso)` produced different markup on each side and
 * React threw a hydration mismatch. Reading the parts through Intl in one
 * fixed zone makes both runtimes agree, and every comparison afterwards is
 * plain arithmetic on those numbers.
 */
export function zonedDate(instant: Date | string, timeZone: string): Date {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  // Hour comes back as 24 at midnight under hour12:false in some engines.
  const hour = get("hour") % 24;
  return new Date(get("year"), get("month") - 1, get("day"), hour, get("minute"), 0, 0);
}

/** "Now", as a civil date in the household's timezone. */
export function nowIn(timeZone: string): Date {
  return zonedDate(new Date(), timeZone);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export function relDay(d: Date, today: Date): string {
  const diff = Math.round(
    (startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000,
  );
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === 2) return "מחרתיים";
  if (diff === -1) return "אתמול";
  if (diff < 0) return `לפני ${-diff} ימים`;
  if (diff < 7) return `יום ${DOW_LONG[startOfDay(d).getDay()]}`;
  return `${d.getDate()} ב${MONTHS[d.getMonth()]}`;
}

/** appointments comes back as an object or a one-element array depending on the query. */
export function appointmentOf(event: CalendarEvent): Appointment | null {
  const a = event.appointments;
  if (!a) return null;
  return Array.isArray(a) ? (a[0] ?? null) : a;
}

export function ageAt(birthDate: string, at: Date): number {
  const b = new Date(birthDate);
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
  return age;
}

/**
 * Expands events into dated instances covering [from, to).
 *
 * Recurrence is stored as an RFC 5545 rule, so expansion has to honour real
 * calendar arithmetic — month lengths, DST — rather than adding fixed
 * offsets. rrule works in UTC internally, so the base time-of-day is
 * re-applied locally to each instance; otherwise a weekly 17:00 event drifts
 * by an hour when the clocks change.
 */
export function expandEvents(
  events: CalendarEvent[],
  from: Date,
  to: Date,
  timeZone: string,
): Occurrence[] {
  const out: Occurrence[] = [];

  for (const event of events) {
    const base = zonedDate(event.starts_at, timeZone);

    if (!event.rrule) {
      if (base >= from && base < to) out.push({ event, start: base, repeated: false });
      continue;
    }

    let rule: RRule;
    try {
      const options = RRule.parseString(event.rrule.replace(/^RRULE:/, ""));
      rule = new RRule({ ...options, dtstart: base });
    } catch {
      // A malformed rule must not blank out the whole month.
      if (base >= from && base < to) out.push({ event, start: base, repeated: false });
      continue;
    }

    for (const utc of rule.between(from, to, true)) {
      const local = new Date(
        utc.getFullYear(),
        utc.getMonth(),
        utc.getDate(),
        base.getHours(),
        base.getMinutes(),
        0,
        0,
      );
      out.push({
        event,
        start: local,
        repeated: local.getTime() !== base.getTime(),
      });
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** The reminder schedule for an event, mirroring rebuild_event_reminders(). */
export function reminderPlan(
  event: CalendarEvent,
  start: Date,
): { kind: string; label: string; at: Date }[] {
  if (!event.reminders_on) return [];

  if (event.kind === "birthday" || event.kind === "holiday") {
    const at = new Date(start);
    at.setHours(10, 30, 0, 0);
    return [{ kind: "day_of_1030", label: "ביום האירוע, 10:30", at }];
  }

  return [
    {
      kind: "lead_24h",
      label: "24 שעות לפני",
      at: new Date(start.getTime() - 86_400_000),
    },
    {
      kind: "lead_1h",
      label: "שעה לפני",
      at: new Date(start.getTime() - 3_600_000),
    },
  ];
}
