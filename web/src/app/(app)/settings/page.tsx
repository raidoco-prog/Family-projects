import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import SettingsBoard from "./SettingsBoard";

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

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const [{ data: prefs }, { count: deviceCount }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("member_id", session.member.id)
      .maybeSingle<Preferences>(),
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("member_id", session.member.id),
  ]);

  return (
    <SettingsBoard
      memberName={session.member.display_name}
      preferences={prefs}
      deviceCount={deviceCount ?? 0}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
