"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { nextOccurrence, zonedTimeToInstant } from "@/lib/calendar";
import type { TaskStatus } from "@/lib/types";

export interface ActionResult {
  error?: string;
}

const EXPIRED = "פג תוקף החיבור. התחברו מחדש.";

export interface NewTaskInput {
  title: string;
  assigneeId: string;
  /** Local date, yyyy-mm-dd. Empty for no deadline. */
  date: string;
  /** Local time, HH:MM. */
  time: string;
  priority: number;
  notes: string;
  repeat: "none" | "daily" | "weekly" | "monthly" | "yearly";
}

/** Same vocabulary the event form uses, so "every week" means one thing. */
const RRULES: Record<NewTaskInput["repeat"], string | null> = {
  none: null,
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

export async function createTask(input: NewTaskInput): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { error: "צריך למלא כותרת." };
  if (![1, 2, 3].includes(input.priority)) return { error: "עדיפות לא תקינה." };
  // A repeat with nothing to repeat from has no next occurrence to compute.
  if (input.repeat !== "none" && !input.date) {
    return { error: "משימה חוזרת צריכה תאריך יעד." };
  }

  const session = await getSession();
  if (!session) return { error: EXPIRED };

  let dueAt: string | null = null;
  if (input.date) {
    // Same rule as events: the typed time means the household's clock, not
    // the server's, which is UTC in production.
    const when = zonedTimeToInstant(
      `${input.date}T${input.time || "20:00"}`,
      session.household.timezone || "Asia/Jerusalem",
    );
    if (Number.isNaN(when.getTime())) return { error: "תאריך או שעה לא תקינים." };
    dueAt = when.toISOString();
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    household_id: session.household.id,
    title,
    notes: input.notes.trim() || null,
    assignee_id: input.assigneeId || session.member.id,
    created_by: session.member.id,
    due_at: dueAt,
    priority: input.priority,
    status: "open",
    rrule: RRULES[input.repeat],
  });

  return error ? { error: "יצירת המשימה נכשלה. נסו שוב." } : {};
}

/**
 * T8 — completing a recurring task spawns the next occurrence.
 *
 * The question the plan left open was what "completing" one means. It writes
 * a **new row** rather than moving the existing one forward, because the
 * completed row is the record of who actually did it — `completed_by`, which
 * in a house is regularly not the assignee. Rolling one row forward would
 * overwrite that every week and leave no history at all.
 *
 * It happens here rather than in the cron so the next chore appears the
 * moment you tick the last one; a quarter-hour of nothing would read as the
 * repeat having failed.
 */
export async function setTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const done = status === "done";
  const supabase = await createClient();

  // Read first: only the open → done transition may spawn. Ticking an
  // already-done task twice must not produce two next occurrences.
  const { data: before } = await supabase
    .from("tasks")
    .select("id,household_id,title,notes,assignee_id,due_at,priority,rrule,status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      household_id: string;
      title: string;
      notes: string | null;
      assignee_id: string | null;
      due_at: string | null;
      priority: number;
      rrule: string | null;
      status: TaskStatus;
    }>();

  const { error } = await supabase
    .from("tasks")
    .update({
      status,
      // Who actually did it, which is not always who it was assigned to.
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? session.member.id : null,
    })
    .eq("id", id);

  if (error) return { error: "העדכון נכשל. נסו שוב." };

  const spawns =
    done && before && before.status !== "done" && before.rrule && before.due_at;
  if (!spawns) return {};

  const next = nextOccurrence(
    before.rrule as string,
    new Date(before.due_at as string),
    session.household.timezone || "Asia/Jerusalem",
  );
  // A rule that has run out is not an error — the series simply ended.
  if (!next) return {};

  const { error: spawnError } = await supabase.from("tasks").insert({
    household_id: before.household_id,
    title: before.title,
    notes: before.notes,
    assignee_id: before.assignee_id,
    created_by: session.member.id,
    due_at: next.toISOString(),
    priority: before.priority,
    status: "open",
    rrule: before.rrule,
  });

  // The completion itself succeeded, so this is not reported as a failure of
  // the tick — but it must not be silent either.
  return spawnError ? { error: "המשימה סומנה, אך המופע הבא לא נוצר." } : {};
}

export async function reassignTask(
  id: string,
  assigneeId: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ assignee_id: assigneeId })
    .eq("id", id);

  return error ? { error: "העברת האחריות נכשלה. נסו שוב." } : {};
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  return error ? { error: "המחיקה נכשלה. נסו שוב." } : {};
}
