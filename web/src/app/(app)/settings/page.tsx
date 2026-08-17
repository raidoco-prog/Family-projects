import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import SettingsBoard from "./SettingsBoard";
import CalendarCard, { type CalendarStatus } from "./CalendarCard";

export interface Preferences {
  member_id: string;
  appointments: boolean;
  events: boolean;
  birthdays: boolean;
  tasks: boolean;
  shopping: boolean;
  digest: boolean;
  digest_at: string;
  quiet_from: string;
  quiet_to: string;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar_error?: string }>;
}) {
  const { calendar_error: calendarError } = await searchParams;
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const [{ data: prefs }, { count: deviceCount }, { data: calendar }] =
    await Promise.all([
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("member_id", session.member.id)
      .maybeSingle<Preferences>(),
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("member_id", session.member.id),
    // calendar_connections is unreadable from a browser by design; this
    // function returns only the status fields, never the refresh token.
    supabase.rpc("calendar_status").maybeSingle<CalendarStatus>(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <SettingsBoard
        memberName={session.member.display_name}
        preferences={prefs}
        deviceCount={deviceCount ?? 0}
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      />
      <CalendarCard
        connectError={calendarError}
        status={
          calendar ?? {
            connected: false,
            google_email: null,
            last_synced_at: null,
            last_error: null,
          }
        }
      />
    </div>
  );
}
