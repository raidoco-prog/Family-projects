"use client";

import { useState, useTransition } from "react";
import MemberAvatar from "@/components/MemberAvatar";
import type { CalendarEvent, EventKind, Member } from "@/lib/types";
import { createEvent, updateEvent, type NewEventInput } from "./actions";
import { appointmentOf, isoDay, timeStr, zonedDate } from "@/lib/calendar";

const KINDS: { value: EventKind; label: string }[] = [
  { value: "general", label: "אירוע" },
  { value: "appointment", label: "תור רפואי" },
  { value: "school", label: "בית ספר" },
  { value: "holiday", label: "חג" },
];

const REPEATS: { value: NewEventInput["repeat"]; label: string }[] = [
  { value: "none", label: "לא חוזר" },
  { value: "daily", label: "כל יום" },
  { value: "weekly", label: "כל שבוע" },
  { value: "monthly", label: "כל חודש" },
  { value: "yearly", label: "כל שנה" },
];

/** Stored as a Postgres interval on appointments.follow_up_after. */
const FOLLOW_UPS: { value: string; label: string }[] = [
  { value: "", label: "לא נדרשת" },
  { value: "1 month", label: "בעוד חודש" },
  { value: "3 months", label: "בעוד שלושה חודשים" },
  { value: "6 months", label: "בעוד חצי שנה" },
  { value: "1 year", label: "בעוד שנה" },
];

const field =
  "h-10 rounded-xl border border-rule bg-ground px-3 text-sm placeholder:text-ink-faint";


/**
 * Turns a stored event back into the values the form edits.
 *
 * The recurrence needs care. This form offers four simple repeats, but the
 * calendar also holds rules it did not write — an imported Google event
 * repeats on "SU,TU", and a `FREQ=WEEKLY` read out of that and written back
 * would silently drop the days. Anything that does not map exactly is
 * reported as "custom", which the form shows and refuses to rewrite, so
 * editing a title cannot quietly change when the event happens.
 */
function repeatOf(rrule: string | null): NewEventInput["repeat"] {
  if (!rrule) return "none";
  const simple: Record<string, NewEventInput["repeat"]> = {
    "FREQ=DAILY": "daily",
    "FREQ=WEEKLY": "weekly",
    "FREQ=MONTHLY": "monthly",
    "FREQ=YEARLY": "yearly",
  };
  return simple[rrule.replace(/^RRULE:/, "").trim().toUpperCase()] ?? "keep";
}

function describe(event: CalendarEvent, timeZone: string) {
  const local = zonedDate(event.starts_at, timeZone);
  return {
    kind: event.kind,
    allDay: event.all_day,
    remindersOn: event.reminders_on,
    date: isoDay(local),
    time: timeStr(local),
    location: event.location ?? "",
    repeat: repeatOf(event.rrule),
    participants: (event.event_participants ?? []).map((p) => p.member_id),
    appointment: appointmentOf(event),
  };
}

export default function EventForm({
  members,
  currentMemberId,
  defaultDate,
  timeZone,
  event,
  onDone,
  onCancel,
}: {
  members: Member[];
  currentMemberId: string;
  defaultDate: string;
  timeZone: string;
  /** When present the form edits this event instead of creating one. */
  event?: CalendarEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const editing = Boolean(event);
  const existing = event
    ? { ...describe(event, timeZone), title: event.title }
    : null;

  const [kind, setKind] = useState<EventKind>(existing?.kind ?? "general");
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);
  const [participants, setParticipants] = useState<string[]>(
    existing?.participants ?? [currentMemberId],
  );
  const [patientId, setPatientId] = useState(
    existing?.appointment?.patient_id ?? members[0]?.id ?? "",
  );
  const [remindersOn, setRemindersOn] = useState(existing?.remindersOn ?? true);
  const [referralNeeded, setReferralNeeded] = useState(
    existing?.appointment?.referral_needed ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isAppointment = kind === "appointment";
  // Birthdays and holidays get a single 10:30 notice on the day itself.
  const dayOfRule = kind === "holiday" || kind === "birthday";

  function toggleParticipant(id: string) {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function submit(formData: FormData) {
    const input: NewEventInput = {
      title: String(formData.get("title") ?? ""),
      kind,
      date: String(formData.get("date") ?? ""),
      time: String(formData.get("time") ?? ""),
      allDay,
      location: String(formData.get("location") ?? ""),
      repeat: String(formData.get("repeat") ?? "none") as NewEventInput["repeat"],
      participants,
      remindersOn,
      appointment: isAppointment
        ? {
            patientId,
            doctorName: String(formData.get("doctor") ?? ""),
            specialty: String(formData.get("specialty") ?? ""),
            clinic: String(formData.get("clinic") ?? ""),
            hmo: String(formData.get("hmo") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            prepNotes: String(formData.get("prep") ?? ""),
            referralNeeded,
            referralNumber: referralNeeded
              ? String(formData.get("referral_number") ?? "")
              : "",
            followUpAfter: String(formData.get("follow_up") ?? ""),
          }
        : undefined,
    };

    startTransition(async () => {
      const res = event ? await updateEvent(event.id, input) : await createEvent(input);
      if (res.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]"
    >
      <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
        אירוע חדש
      </h2>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            aria-pressed={kind === k.value}
            className={`rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${
              kind === k.value
                ? "border-accent/30 bg-accent-pastel text-accent"
                : "border-rule bg-surface text-ink-soft"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <input
        name="title"
        defaultValue={existing?.title ?? ""}
        required
        autoFocus
        placeholder={isAppointment ? "למשל: רופא שיניים" : "כותרת האירוע"}
        aria-label="כותרת האירוע"
        className={field}
      />

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[0.74rem] text-ink-soft">תאריך</span>
          <input type="date" name="date" required defaultValue={existing?.date ?? defaultDate} className={field} />
        </label>
        {!allDay ? (
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[0.74rem] text-ink-soft">שעה</span>
            <input type="time" name="time" defaultValue={existing?.time ?? "09:00"} className={field} />
          </label>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        כל היום
      </label>

      <input name="location" placeholder="מיקום (לא חובה)" aria-label="מיקום" defaultValue={existing?.location ?? ""} className={field} />

      <label className="flex flex-col gap-1">
        <span className="text-[0.74rem] text-ink-soft">חזרתיות</span>
        <select name="repeat" defaultValue={existing?.repeat ?? "none"} className={field}>
          {/* A rule this form cannot express — an imported Google event
              repeating on particular weekdays, say. Offered so it can be
              kept, because the alternative is that opening the form to fix
              a title rewrites when the event happens. */}
          {existing?.repeat === "keep" ? (
            <option value="keep">חזרתיות מיובאת — להשאיר כפי שהיא</option>
          ) : null}
          {REPEATS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      {isAppointment ? (
        <fieldset className="flex flex-col gap-2 rounded-xl border border-rule p-2.5">
          <legend className="px-1 text-[0.74rem] font-bold text-ink-soft">פרטי התור</legend>

          <label className="flex flex-col gap-1">
            <span className="text-[0.74rem] text-ink-soft">מטופל</span>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              aria-label="מטופל"
              className={field}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <input name="doctor" defaultValue={existing?.appointment?.doctor_name ?? ""} placeholder="שם הרופא" aria-label="שם הרופא" className={`${field} flex-1`} />
            <input name="specialty" defaultValue={existing?.appointment?.specialty ?? ""} placeholder="התמחות" aria-label="התמחות" className={`${field} flex-1`} />
          </div>
          <div className="flex gap-2">
            <input name="clinic" defaultValue={existing?.appointment?.clinic ?? ""} placeholder="מרפאה" aria-label="מרפאה" className={`${field} flex-1`} />
            <input name="hmo" defaultValue={existing?.appointment?.hmo ?? ""} placeholder="קופת חולים" aria-label="קופת חולים" className={`${field} flex-1`} />
          </div>
          <input name="phone" defaultValue={existing?.appointment?.phone ?? ""} type="tel" placeholder="טלפון המרפאה" aria-label="טלפון המרפאה" className={field} dir="ltr" />
          <input name="prep" defaultValue={existing?.appointment?.prep_notes ?? ""} placeholder="להכין מראש (צום, טופס 17…)" aria-label="להכין מראש" className={field} />

          {/* A5 */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={referralNeeded}
              onChange={(e) => setReferralNeeded(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            נדרשת הפניה
          </label>
          {referralNeeded ? (
            <input
              name="referral_number"
              defaultValue={existing?.appointment?.referral_number ?? ""}
              placeholder="מספר הפניה"
              aria-label="מספר הפניה"
              className={field}
              dir="ltr"
            />
          ) : null}

          {/* A7 */}
          <label className="flex flex-col gap-1">
            <span className="text-[0.74rem] text-ink-soft">ביקורת הבאה</span>
            <select name="follow_up" defaultValue={existing?.appointment?.follow_up_after ?? ""} aria-label="ביקורת הבאה" className={field}>
              {FOLLOW_UPS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[0.74rem] text-ink-soft">למי זה נוגע</legend>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = participants.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleParticipant(m.id)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.78rem] font-semibold ${
                  on ? "border-accent/30 bg-accent-pastel text-accent" : "border-rule text-ink-soft"
                }`}
              >
                <MemberAvatar member={m} size="xs" />
                {m.display_name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-2 rounded-xl border border-rule bg-ground px-2.5 py-2">
        <span className="text-[0.79rem] font-semibold">תזכורות</span>
        <span className="text-[0.73rem] text-ink-soft">
          {dayOfRule ? "ב-10:30 ביום האירוע" : "24 שעות לפני, ושעה לפני"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={remindersOn}
          aria-label="הפעלת תזכורות לאירוע"
          onClick={() => setRemindersOn((v) => !v)}
          className={`relative ms-auto h-[21px] w-[38px] shrink-0 rounded-full p-0.5 transition ${
            remindersOn ? "bg-accent" : "bg-rule"
          }`}
        >
          <span
            className={`block size-[17px] rounded-full bg-surface shadow transition-transform ${
              remindersOn ? "-translate-x-[17px]" : ""
            }`}
          />
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 flex-1 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
        >
          {pending ? "רגע…" : editing ? "שמירת השינויים" : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-xl border border-rule px-4 text-sm font-semibold text-ink-soft"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
