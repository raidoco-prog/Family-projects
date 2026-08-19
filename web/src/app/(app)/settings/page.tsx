import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { vapidKeyVerdict } from "@/lib/notifications";
import SettingsBoard from "./SettingsBoard";
import CalendarCard, { type CalendarStatus } from "./CalendarCard";
import VapidSetup from "./VapidSetup";
import TestPush from "./TestPush";

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

  // Whether the two keys are halves of one pair. Present and well-formed
  // is not the same as matching, and the difference is invisible: both
  // values look like the right kind of gibberish either way.
  const keyVerdict = vapidKeyVerdict();

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
  const [{ data: prefs }, { data: devices }, { data: calendar }] =
    await Promise.all([
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("member_id", session.member.id)
      .maybeSingle<Preferences>(),
    // The endpoints themselves, not a count. A count cannot answer the
    // question that matters here — whether *this* device is among them —
    // and that question is what the screen was getting wrong.
    supabase
      .from("push_subscriptions")
      .select("endpoint")
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
        endpoints={(devices ?? []).map((d: { endpoint: string }) => d.endpoint)}
        vapidPublicKey={vapidPublicKey}
      />
      {/* Only when the key is genuinely missing — which is exactly when
          somebody is stuck on it, and never once it is configured. */}
      {vapidPublicKey ? null : <VapidSetup seen={seen} />}

      {/* A configuration fault, so it is said before anything is pressed
          rather than as the result of a failed send. The two keys can look
          entirely correct and still not be halves of the same pair — which
          is what happens when they are generated twice and one of each is
          copied — and no amount of pressing "enable" on a phone will move
          it. */}
      {vapidPublicKey && keyVerdict !== "ok" && keyVerdict !== "missing" ? (
        <p
          role="alert"
          className="rounded-2xl border border-danger/25 bg-danger-pastel p-3.5 text-[0.82rem] leading-relaxed font-semibold text-danger-ink"
        >
          {keyVerdict === "not-a-pair"
            ? "המפתח הציבורי והפרטי בשרת אינם זוג, ולכן שום התראה לא תישלח. זה קורה כשיוצרים מפתחות פעמיים ומעתיקים אחד מכל יצירה. צרו זוג חדש, החליפו את שניהם ב-Vercel, ופרסו מחדש."
            : "אחד ממפתחות ההתראות בשרת אינו תקין — כנראה הועתק חלקית. צרו זוג חדש, החליפו את שניהם ב-Vercel, ופרסו מחדש."}
        </p>
      ) : null}

      {/* Only worth offering once a push could actually be signed. Before
          that the answer is always the same and says nothing useful. */}
      {vapidPublicKey ? <TestPush /> : null}

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
