import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import SettingsBoard from "./SettingsBoard";
import CalendarCard, { type CalendarStatus } from "./CalendarCard";
import VapidSetup from "./VapidSetup";

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

  // Trimmed: a value pasted with a trailing newline is not empty, so it
  // passes every "is it set" check and then fails as an invalid key much
  // later, with an error that points nowhere near the cause.
  const vapidPublicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();

  // Which of the three the server can actually see, by name only — never
  // a value. Without this the screen says the same thing whether nothing
  // was added, one name was mistyped, or everything was added and the
  // deploy never happened, and those need different answers.
  const seen = {
    publicKey: Boolean(vapidPublicKey),
    privateKey: Boolean((process.env.VAPID_PRIVATE_KEY ?? "").trim()),
    cronSecret: Boolean((process.env.CRON_SECRET ?? "").trim()),
  };

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
        vapidPublicKey={vapidPublicKey}
      />
      {/* Only when the key is genuinely missing — which is exactly when
          somebody is stuck on it, and never once it is configured. */}
      {vapidPublicKey ? null : <VapidSetup seen={seen} />}

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
