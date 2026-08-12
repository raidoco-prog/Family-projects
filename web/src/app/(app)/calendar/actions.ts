"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import type { EventKind } from "@/lib/types";

export interface ActionResult {
  error?: string;
}

const EXPIRED = "פג תוקף החיבור. התחברו מחדש.";

export interface NewEventInput {
  title: string;
  kind: EventKind;
  /** Local date, yyyy-mm-dd. */
  date: string;
  /** Local time, HH:MM. Ignored for all-day events. */
  time: string;
  allDay: boolean;
  location: string;
  repeat: "none" | "daily" | "weekly" | "monthly" | "yearly";
  participants: string[];
  remindersOn: boolean;
  appointment?: {
    patientId: string;
    doctorName: string;
    specialty: string;
    clinic: string;
    hmo: string;
    phone: string;
    prepNotes: string;
  };
}

const RRULES: Record<NewEventInput["repeat"], string | null> = {
  none: null,
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

export async function createEvent(input: NewEventInput): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { error: "צריך למלא כותרת." };
  if (!input.date) return { error: "צריך לבחור תאריך." };

  const session = await getSession();
  if (!session) return { error: EXPIRED };

  // Built from local parts so the stored instant matches what was typed.
  const startsAt = new Date(
    `${input.date}T${input.allDay ? "00:00" : input.time || "09:00"}:00`,
  );
  if (Number.isNaN(startsAt.getTime())) return { error: "תאריך או שעה לא תקינים." };

  if (input.kind === "appointment" && !input.appointment?.patientId) {
    return { error: "בתור רפואי צריך לבחור מטופל." };
  }

  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      household_id: session.household.id,
      kind: input.kind,
      title,
      location: input.location.trim() || null,
      starts_at: startsAt.toISOString(),
      all_day: input.allDay,
      rrule: RRULES[input.repeat],
      reminders_on: input.remindersOn,
      created_by: session.member.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !event) return { error: "יצירת האירוע נכשלה. נסו שוב." };

  // Participants decide who the reminder trigger notifies, so they are
  // written before anything else can read the event.
  const people = new Set(input.participants);
  if (input.appointment?.patientId) people.add(input.appointment.patientId);

  if (people.size) {
    await supabase.from("event_participants").insert(
      [...people].map((member_id) => ({ event_id: event.id, member_id })),
    );
  }

  if (input.kind === "appointment" && input.appointment) {
    const a = input.appointment;
    const { error: apptError } = await supabase.from("appointments").insert({
      event_id: event.id,
      patient_id: a.patientId,
      doctor_name: a.doctorName.trim() || null,
      specialty: a.specialty.trim() || null,
      clinic: a.clinic.trim() || null,
      hmo: a.hmo.trim() || null,
      phone: a.phone.trim() || null,
      prep_notes: a.prepNotes.trim() || null,
    });

    if (apptError) {
      // Without its detail row the event is a half-made appointment.
      await supabase.from("events").delete().eq("id", event.id);
      return { error: "שמירת פרטי התור נכשלה. נסו שוב." };
    }
  }

  return {};
}

export async function setEventReminders(
  eventId: string,
  on: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ reminders_on: on })
    .eq("id", eventId);

  return error ? { error: "העדכון נכשל. נסו שוב." } : {};
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();

  // Birthdays are derived from a member's birth_date; deleting the event
  // would just be undone the next time that member is touched.
  const { data: event } = await supabase
    .from("events")
    .select("birthday_for")
    .eq("id", eventId)
    .maybeSingle<{ birthday_for: string | null }>();

  if (event?.birthday_for) {
    return { error: "יום הולדת נגזר מתאריך הלידה. שנו אותו במסך המשפחה." };
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  return error ? { error: "המחיקה נכשלה. נסו שוב." } : {};
}
