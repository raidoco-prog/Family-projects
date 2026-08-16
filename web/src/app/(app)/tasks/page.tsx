import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";
import TasksBoard from "./TasksBoard";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("household_id", session.household.id)
    .order("due_at", { nullsFirst: false })
    .returns<Task[]>();

  return (
    <TasksBoard
      householdId={session.household.id}
      members={session.members}
      currentMemberId={session.member.id}
      initialTasks={data ?? []}
      timeZone={session.household.timezone || "Asia/Jerusalem"}
    />
  );
}
