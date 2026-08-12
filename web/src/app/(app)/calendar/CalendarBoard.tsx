"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MemberAvatar from "@/components/MemberAvatar";
import type { CalendarEvent, Member, Occurrence } from "@/lib/types";
import {
  DOW_SHORT,
  MONTHS,
  addDays,
  ageAt,
  appointmentOf,
  expandEvents,
  isoDay,
  nowIn,
  relDay,
  reminderPlan,
  sameDay,
  shortDate,
  startOfDay,
  timeStr,
} from "@/lib/calendar";
import { deleteEvent, setEventReminders } from "./actions";
import EventForm from "./EventForm";

const KIND_BADGE: Partial<Record<CalendarEvent["kind"], string>> = {
  appointment: "תור רפואי",
  birthday: "יום הולדת",
  holiday: "חג",
  school: "בית ספר",
};

export default function CalendarBoard({
  members,
  currentMemberId,
  initialEvents,
  timeZone,
}: {
  members: Member[];
  currentMemberId: string;
  initialEvents: CalendarEvent[];
  timeZone: string;
}) {
  const router = useRouter();
  // Server and client must agree on "today" or hydration mismatches, so it
  // is resolved in the household's zone rather than each runtime's own.
  const today = startOfDay(nowIn(timeZone));

  const [events, setEvents] = useState(initialEvents);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  // The grid always shows six full weeks, so expansion has to cover the
  // leading and trailing days from the neighbouring months too.
  const gridStart = useMemo(
    () => addDays(month, -month.getDay()),
    [month],
  );
  const gridEnd = useMemo(() => addDays(gridStart, 42), [gridStart]);

  const monthOccurrences = useMemo(
    () => expandEvents(events, gridStart, gridEnd, timeZone),
    [events, gridStart, gridEnd, timeZone],
  );

  const upcoming = useMemo(
    () => expandEvents(events, today, addDays(today, 8), timeZone).slice(0, 6),
    [events, today, timeZone],
  );

  const dayOccurrences = useMemo(
    () => monthOccurrences.filter((o) => sameDay(o.start, selected)),
    [monthOccurrences, selected],
  );

  function firstParticipantColor(o: Occurrence): string {
    const id = o.event.event_participants?.[0]?.member_id;
    const m = id ? memberById.get(id) : null;
    return m?.color ?? "var(--ink-faint)";
  }

  function toggleReminders(event: CalendarEvent) {
    const next = !event.reminders_on;
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, reminders_on: next } : e)),
    );
    startTransition(async () => {
      const res = await setEventReminders(event.id, next);
      if (res.error) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id ? { ...e, reminders_on: event.reminders_on } : e,
          ),
        );
        setError(res.error);
      }
    });
  }

  function remove(event: CalendarEvent) {
    const snapshot = events;
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    setError(null);
    startTransition(async () => {
      const res = await deleteEvent(event.id);
      if (res.error) {
        setEvents(snapshot);
        setError(res.error);
      }
    });
  }

  return (
    <>
      {/* ---------------- month grid ---------------- */}
      <div className="rounded-2xl border border-rule bg-surface p-3 pb-2 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between pb-2">
          {/* Explicit SVG chevrons: the ‹ › glyphs are bidi-mirrored in an RTL
              document and end up pointing the wrong way. */}
          <button
            type="button"
            aria-label="חודש קודם"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-sunk"
          >
            <svg viewBox="0 0 24 24" className="size-[17px] fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
          <b className="text-[0.95rem] font-bold">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </b>
          <button
            type="button"
            aria-label="חודש הבא"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-sunk"
          >
            <svg viewBox="0 0 24 24" className="size-[17px] fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {DOW_SHORT.map((d) => (
            <div key={d} className="pb-1 text-center text-[0.66rem] font-bold text-ink-faint">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map((day) => {
            const dots = monthOccurrences.filter((o) => sameDay(o.start, day)).slice(0, 4);
            const outside = day.getMonth() !== month.getMonth();
            const isToday = sameDay(day, today);
            const isSelected = sameDay(day, selected);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelected(day)}
                aria-label={`${day.getDate()} ב${MONTHS[day.getMonth()]}`}
                aria-current={isSelected ? "date" : undefined}
                className={`flex aspect-square flex-col items-center gap-0.5 rounded-[10px] pt-0.5 text-[0.8rem] tabular-nums ${
                  isSelected ? "bg-accent-pastel font-bold text-ink" : ""
                } ${outside ? "text-ink-faint opacity-60" : ""} ${
                  isToday && !isSelected ? "font-extrabold text-accent" : ""
                }`}
              >
                <span>{day.getDate()}</span>
                <span className="flex h-[5px] items-center gap-[2px]">
                  {dots.map((o, i) => (
                    <span
                      key={`${o.event.id}-${i}`}
                      className="size-[5px] rounded-full"
                      style={{ background: firstParticipantColor(o) }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {/* ---------------- selected day ---------------- */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            {relDay(selected, today)}
          </h1>
          <span className="text-[0.74rem] text-ink-faint tabular-nums">
            {shortDate(selected)}
          </span>
        </div>

        {dayOccurrences.length ? (
          dayOccurrences.map((o, i) => (
            <EventCard
              key={`${o.event.id}-${i}`}
              occurrence={o}
              today={today}
              memberById={memberById}
              onToggleReminders={() => toggleReminders(o.event)}
              onDelete={() => remove(o.event)}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-ink-faint shadow-[var(--shadow)]">
            אין אירועים ביום זה
          </div>
        )}
      </section>

      {/* ---------------- coming up ---------------- */}
      {upcoming.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            השבוע הקרוב
          </h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {upcoming.map((o, i) => (
              <li key={`${o.event.id}-up-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(startOfDay(o.start));
                    setMonth(new Date(o.start.getFullYear(), o.start.getMonth(), 1));
                  }}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-start"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[0.93rem] font-semibold">
                      {o.event.title}
                    </span>
                    <span className="text-[0.78rem] text-ink-soft">
                      {relDay(o.start, today)}
                      {o.event.all_day ? "" : ` · ${timeStr(o.start)}`}
                      {o.event.location ? ` · ${o.event.location}` : ""}
                    </span>
                  </div>
                  {KIND_BADGE[o.event.kind] ? (
                    <span className="rounded-full bg-signal-pastel px-2 py-0.5 text-[0.66rem] font-bold text-signal">
                      {KIND_BADGE[o.event.kind]}
                    </span>
                  ) : null}
                  <span className="flex gap-0.5">
                    {(o.event.event_participants ?? []).map((p) => {
                      const m = memberById.get(p.member_id);
                      return m ? <MemberAvatar key={p.member_id} member={m} size="xs" /> : null;
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {composing ? (
        <EventForm
          members={members}
          currentMemberId={currentMemberId}
          defaultDate={isoDay(selected)}
          onDone={() => {
            setComposing(false);
            router.refresh();
          }}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="h-11 rounded-xl border border-rule bg-surface text-sm font-bold text-accent"
        >
          אירוע חדש
        </button>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function EventCard({
  occurrence,
  today,
  memberById,
  onToggleReminders,
  onDelete,
}: {
  occurrence: Occurrence;
  today: Date;
  memberById: Map<string, Member>;
  onToggleReminders: () => void;
  onDelete: () => void;
}) {
  const { event, start, repeated } = occurrence;
  const appt = appointmentOf(event);
  const plan = reminderPlan(event, start);

  const recipients = useMemo(() => {
    const ids = new Set<string>();
    for (const m of memberById.values()) if (m.role === "parent") ids.add(m.id);
    for (const p of event.event_participants ?? []) ids.add(p.member_id);
    if (appt) ids.add(appt.patient_id);
    return [...ids].map((id) => memberById.get(id)).filter(Boolean) as Member[];
  }, [event.event_participants, appt, memberById]);

  const birthdayMember = event.birthday_for ? memberById.get(event.birthday_for) : null;

  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[0.95rem]">{event.title}</b>
        {KIND_BADGE[event.kind] ? (
          <span className="rounded-full bg-signal-pastel px-2 py-0.5 text-[0.66rem] font-bold text-signal">
            {KIND_BADGE[event.kind]}
          </span>
        ) : null}
        {event.rrule ? (
          <span className="rounded-full bg-sunk px-2 py-0.5 text-[0.66rem] font-bold text-ink-soft">
            {repeated ? "מופע חוזר" : "חוזר"}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`מחיקת ${event.title}`}
          className="ms-auto px-1 text-lg leading-none text-ink-faint hover:text-danger"
        >
          ×
        </button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[0.8rem]">
        <dt className="text-ink-faint">מתי</dt>
        <dd className="text-ink-soft">
          {event.all_day
            ? `${relDay(start, today)} (כל היום)`
            : `${timeStr(start)}, ${relDay(start, today)}`}
        </dd>

        {event.location ? (
          <>
            <dt className="text-ink-faint">איפה</dt>
            <dd className="text-ink-soft">{event.location}</dd>
          </>
        ) : null}

        {birthdayMember?.birth_date ? (
          <>
            <dt className="text-ink-faint">גיל</dt>
            <dd className="text-ink-soft tabular-nums">
              {ageAt(birthdayMember.birth_date, start)}
            </dd>
          </>
        ) : null}

        {appt ? (
          <>
            <dt className="text-ink-faint">מטופל</dt>
            <dd className="text-ink-soft">
              {memberById.get(appt.patient_id)?.display_name ?? "—"}
            </dd>
            {appt.doctor_name || appt.specialty ? (
              <>
                <dt className="text-ink-faint">רופא</dt>
                <dd className="text-ink-soft">
                  {[appt.doctor_name, appt.specialty].filter(Boolean).join(" · ")}
                </dd>
              </>
            ) : null}
            {appt.clinic || appt.hmo ? (
              <>
                <dt className="text-ink-faint">מרפאה</dt>
                <dd className="text-ink-soft">
                  {[appt.clinic, appt.hmo].filter(Boolean).join(" · ")}
                </dd>
              </>
            ) : null}
            {appt.phone ? (
              <>
                <dt className="text-ink-faint">טלפון</dt>
                <dd className="text-ink-soft" dir="ltr">
                  {appt.phone}
                </dd>
              </>
            ) : null}
          </>
        ) : null}
      </dl>

      {appt?.prep_notes ? (
        <p className="rounded-lg border border-signal/20 bg-signal-soft px-2.5 py-1.5 text-[0.78rem] font-semibold text-signal">
          להכין מראש: {appt.prep_notes}
        </p>
      ) : null}

      {/* ---- reminders ---- */}
      <div
        className={`flex flex-col gap-1.5 rounded-xl border px-2.5 py-2 ${
          event.reminders_on
            ? "border-accent/20 bg-accent-soft"
            : "border-rule bg-sunk opacity-80"
        }`}
      >
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`size-3.5 fill-none stroke-[1.9] ${
              event.reminders_on ? "stroke-accent" : "stroke-ink-faint"
            }`}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          <span
            className={`text-[0.73rem] font-bold uppercase tracking-wider ${
              event.reminders_on ? "text-accent" : "text-ink-faint"
            }`}
          >
            תזכורות
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={event.reminders_on}
            aria-label="הפעלת תזכורות"
            onClick={onToggleReminders}
            className={`relative ms-auto h-[21px] w-[38px] rounded-full p-0.5 transition ${
              event.reminders_on ? "bg-accent" : "bg-rule"
            }`}
          >
            <span
              className={`block size-[17px] rounded-full bg-surface shadow transition-transform ${
                event.reminders_on ? "-translate-x-[17px]" : ""
              }`}
            />
          </button>
        </div>

        {event.reminders_on ? (
          <>
            {plan.map((r) => (
              <div key={r.kind} className="flex items-baseline gap-2 text-[0.79rem]">
                <b className="font-semibold text-ink">{r.label}</b>
                <span className="ms-auto text-[0.73rem] text-ink-soft tabular-nums">
                  {shortDate(r.at)}, {timeStr(r.at)}
                </span>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-1 text-[0.73rem] text-ink-soft">
              נשלח אל:
              {recipients.map((m) => (
                <span key={m.id} className="flex items-center gap-1">
                  <MemberAvatar member={m} size="xs" />
                  {m.display_name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <span className="text-[0.79rem] text-ink-soft">כבויות עבור האירוע הזה</span>
        )}
      </div>
    </article>
  );
}
