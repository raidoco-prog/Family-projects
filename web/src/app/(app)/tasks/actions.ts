"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { zonedTimeToInstant } from "@/lib/calendar";
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
}

export async function createTask(input: NewTaskInput): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { error: "צריך למלא כותרת." };
  if (![1, 2, 3].includes(input.priority)) return { error: "עדיפות לא תקינה." };

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
  });

  return error ? { error: "יצירת המשימה נכשלה. נסו שוב." } : {};
}

export async function setTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const done = status === "done";
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      status,
      // Who actually did it, which is not always who it was assigned to.
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? session.member.id : null,
    })
    .eq("id", id);

  return error ? { error: "העדכון נכשל. נסו שוב." } : {};
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
