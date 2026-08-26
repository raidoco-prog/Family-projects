import { createClient } from "@/lib/supabase/server";

/**
 * Whether the schedule that sends reminders is alive.
 *
 * A test notification and a real reminder travel different roads. The test
 * is sent by this server the moment the button is pressed. A reminder is
 * sent by a job inside the database that wakes every quarter hour and calls
 * the app — and when that job is not running, or is running and being
 * turned away, the phone shows exactly what it shows when everything is
 * fine and nothing is due: nothing.
 *
 * That is how a week passes with working test notifications and no
 * reminders, and no way to tell the two apart. This is the difference,
 * written down.
 */

interface CronRun {
  ran_at: string;
  queued: number;
  sent: number;
  failed: number;
  note: string | null;
}

const MINUTE = 60_000;

/** How long a silence stops being ordinary. The job runs every 15 minutes. */
const STALE_AFTER_MINUTES = 45;

export function describeRun(run: CronRun | null, now: Date) {
  if (!run) {
    return {
      healthy: false,
      title: "המשימה המתוזמנת מעולם לא רצה",
      detail:
        "תזכורות נשלחות ממנה, ולא מהאפליקציה עצמה — לכן התראת בדיקה יכולה לעבוד בזמן ששום תזכורת לא מגיעה. הריצו את cron.sql ב-Supabase.",
    };
  }

  const minutes = Math.floor((now.getTime() - new Date(run.ran_at).getTime()) / MINUTE);

  if (minutes > STALE_AFTER_MINUTES) {
    return {
      healthy: false,
      title:
        minutes < 120
          ? `המשימה לא רצה כבר ${minutes} דקות`
          : `המשימה לא רצה כבר ${Math.floor(minutes / 60)} שעות`,
      detail:
        "היא אמורה לרוץ כל רבע שעה. הריצו שוב את cron.sql — הוא בודק את החיבור ואומר מה נכשל.",
    };
  }

  return {
    healthy: true,
    title: minutes < 1 ? "המשימה רצה עכשיו" : `המשימה רצה לפני ${minutes} דקות`,
    detail:
      run.failed > 0
        ? `בהרצה האחרונה נשלחו ${run.sent} ו-${run.failed} נכשלו.`
        : `בהרצה האחרונה נשלחו ${run.sent} תזכורות.`,
  };
}

export default async function CronHealth() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cron_runs")
    .select("ran_at,queued,sent,failed,note")
    .maybeSingle<CronRun>();

  // The table arrives in a migration, so a deployment can be ahead of the
  // database. Saying which is missing beats a card that silently vanishes.
  if (error) {
    return (
      <section className="rounded-2xl border border-rule bg-surface p-4 text-[0.8rem] leading-relaxed text-ink-soft">
        <b className="text-sm font-bold text-ink">מצב המשימה המתוזמנת</b>
        <p className="mt-1">
          לא ניתן לקרוא את מצב הקרון. אם עוד לא הרצתם את{" "}
          <code dir="ltr">docs/cron-heartbeat.sql</code> ב-Supabase — זה החסר.
        </p>
      </section>
    );
  }

  const verdict = describeRun(data ?? null, new Date());

  return (
    <section
      className={`flex flex-col gap-1 rounded-2xl border p-4 ${
        verdict.healthy
          ? "border-rule bg-surface"
          : "border-danger/25 bg-danger-pastel"
      }`}
    >
      <b
        className={`text-sm font-bold ${verdict.healthy ? "text-ink" : "text-danger-ink"}`}
      >
        {verdict.title}
      </b>
      <p
        className={`text-[0.8rem] leading-relaxed ${
          verdict.healthy ? "text-ink-soft" : "text-danger-ink"
        }`}
      >
        {verdict.detail}
      </p>
      {data?.note ? (
        <p className="text-[0.74rem] text-danger-ink">{data.note}</p>
      ) : null}
    </section>
  );
}
