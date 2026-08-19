"use client";

import { useEffect, useState, useTransition } from "react";
import { isIos, isStandalone } from "@/lib/push";
import { sendTestPush, type TestPushResult } from "./actions";

/**
 * Proof, on the spot, that a device will actually receive reminders.
 *
 * Enabling notifications reports only that the browser accepted the
 * subscription. Everything after that is invisible: the keys, the signing,
 * Apple's push service, the phone's own notification settings. Any of them
 * can be wrong, and the only symptom is a reminder that never arrives —
 * noticed days later, with nothing to point at.
 *
 * One notification, to your own devices, right now. It covers the whole
 * chain except the schedule, which is the one part a person can check
 * another way.
 */
export default function TestPush() {
  const [result, setResult] = useState<TestPushResult | null>(null);
  const [busy, start] = useTransition();
  const [inSafari, setInSafari] = useState(false);

  // The one way "sent" can be true and nothing arrive. iOS shows web push
  // only to an app opened from its home-screen icon; in a Safari tab the
  // subscription works, the push is accepted, and the notification is
  // discarded silently. Reported next to the success rather than instead
  // of it, because the send really did succeed — the fault is downstream.
  useEffect(() => {
    setInSafari(isIos() && !isStandalone());
  }, []);

  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-rule bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">בדיקת התראה</h2>
        <p className="text-xs leading-relaxed text-ink-soft">
          שולח התראה אחת למכשירים שלך עכשיו, כדי לראות שהיא באמת מגיעה. אף
          אחד אחר לא מקבל אותה.
        </p>
      </div>

      <button
        type="button"
        onClick={() => start(async () => setResult(await sendTestPush()))}
        disabled={busy}
        className="h-10 rounded-xl border border-rule text-sm font-bold text-ink disabled:opacity-60"
      >
        {busy ? "שולח…" : "שלחו לי התראת בדיקה"}
      </button>

      {result?.sent ? (
        <p className="rounded-xl bg-accent-pastel p-2.5 text-center text-xs font-bold text-accent">
          {result.sent === 1
            ? "נשלחה למכשיר אחד. אם היא לא הופיעה תוך כמה שניות — ההרשאה כנראה כבויה בהגדרות המכשיר."
            : `נשלחה ל-${result.sent} מכשירים.`}
        </p>
      ) : null}

      {inSafari ? (
        <p className="rounded-xl bg-signal-soft p-2.5 text-[0.72rem] leading-relaxed font-semibold text-signal">
          שימו לב: הדף הזה פתוח בספארי ולא מהסמל במסך הבית. באייפון התראה
          נשלחת בהצלחה אך לא מוצגת במצב הזה. פתחו את האפליקציה מהסמל ונסו
          שוב.
        </p>
      ) : null}

      {result?.error ? (
        <p
          role="alert"
          className="break-words rounded-xl bg-danger-pastel p-2.5 text-xs font-semibold text-danger-ink"
        >
          {result.error}
        </p>
      ) : null}
    </section>
  );
}
