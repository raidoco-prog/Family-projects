import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/lib/types";
import CalendarBoard from "./CalendarBoard";

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();

  // A generous window: enough for the month grid either side of today plus
  // the "coming up" list, without paging on every arrow tap.
  const from = new Date();
  from.setMonth(from.getMonth() - 2);
  const to = new Date();
  to.setMonth(to.getMonth() + 14);

  const { data } = await supabase
    .from("events")
    .select(
      "*, event_participants(member_id), appointments(*), event_reminders(id,member_id,kind,fire_at,sent_at)",
    )
    .eq("household_id", session.household.id)
    // A recurring row starts once but repeats forward, so it must not be
    // filtered out by a lower bound on starts_at.
    .or(`starts_at.gte.${from.toISOString()},rrule.not.is.null`)
    .lte("starts_at", to.toISOString())
    .order("starts_at")
    .returns<CalendarEvent[]>();

  return (
    <CalendarBoard
      members={session.members}
      currentMemberId={session.member.id}
      initialEvents={data ?? []}
      timeZone={session.household.timezone || "Asia/Jerusalem"}
    />
  );
}
