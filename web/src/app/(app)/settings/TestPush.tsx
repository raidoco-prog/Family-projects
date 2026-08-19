"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentSubscription, isIos, isStandalone } from "@/lib/push";
import { forgetOtherDevices, sendTestPush } from "./actions";

/**
 * Proof, on the spot, that this device will actually receive reminders.
 *
 * The version this replaces reported what the push service accepted, and
 * called that "sent". Acceptance is the easy half. Delivery to the device,
 * the worker waking, and the system drawing the notification are all after
 * it, all invisible from the server, and identical in their failure: the
 * screen says the notification went out and the phone shows nothing. Told
 * that, a person has no next step — every remaining explanation is equally
 * consistent with what they can see.
 *
 * So the worker now says when a push arrives, and this waits to hear it.
 * That splits the unknown in two, and the two halves have different
 * answers: heard, and no notification, means the operating system is
 * holding it back. Not heard means it never got there, and the phone's
 * settings are not the place to look.
 */

const HEARD_WITHIN_MS = 12_000;

type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "waiting" }
  | { kind: "delivered" }
  | { kind: "accepted-not-delivered" }
  | { kind: "error"; message: string };

export default function TestPush({ deviceCount }: { deviceCount: number }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [inSafari, setInSafari] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [devices, setDevices] = useState(deviceCount);
  const heard = useRef(false);

  useEffect(() => {
    // The one way "sent" can be true and nothing arrive that is nobody's
    // bug: iOS shows web push only to an app opened from its home-screen
    // icon. In a Safari tab the subscription works and the notification is
    // discarded in silence.
    setInSafari(isIos() && !isStandalone());
    void currentSubscription().then((s) => setEndpoint(s?.endpoint ?? null));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "push-received") return;
      heard.current = true;
      setPhase({ kind: "delivered" });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback(async () => {
    heard.current = false;
    setPhase({ kind: "sending" });

    // Named explicitly, so the answer is about the phone in your hand
    // rather than about every registration this account has ever made.
    const result = await sendTestPush(endpoint ?? undefined);

    if (result.error) {
      setPhase({ kind: "error", message: result.error });
      return;
    }

    setPhase({ kind: "waiting" });
    window.setTimeout(() => {
      if (!heard.current) setPhase({ kind: "accepted-not-delivered" });
    }, HEARD_WITHIN_MS);
  }, [endpoint]);

  async function cleanUp() {
    if (!endpoint) return;
    setCleaning(true);
    const result = await forgetOtherDevices(endpoint);
    setCleaning(false);
    if (result.error) setPhase({ kind: "error", message: result.error });
    else setDevices(result.devices ?? 1);
  }

  const busy = phase.kind === "sending" || phase.kind === "waiting";

  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-rule bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">בדיקת התראה</h2>
        <p className="text-xs leading-relaxed text-ink-soft">
          שולח התראה אחת למכשיר הזה עכשיו, ומחכה לשמוע שהיא הגיעה. אף אחד
          אחר לא מקבל אותה.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void send()}
        disabled={busy}
        className="h-10 rounded-xl border border-rule text-sm font-bold text-ink disabled:opacity-60"
      >
        {phase.kind === "sending"
          ? "שולח…"
          : phase.kind === "waiting"
            ? "ממתין שתגיע…"
            : "שלחו לי התראת בדיקה"}
      </button>

      {phase.kind === "delivered" ? (
        <p className="rounded-xl bg-accent-pastel p-2.5 text-center text-xs font-bold text-accent">
          הגיעה למכשיר הזה. אם ההתראה עצמה לא הופיעה על המסך, ההרשאה כבויה
          בהגדרות המכשיר — הגדרות ‹ התראות ‹ הבית שלנו.
        </p>
      ) : null}

      {phase.kind === "accepted-not-delivered" ? (
        <div className="flex flex-col gap-1.5 rounded-xl bg-danger-pastel p-2.5 text-[0.74rem] leading-relaxed text-danger-ink">
          <b>השרת שלח, והמכשיר לא קיבל.</b>
          <span>
            שירות הדחיפה קיבל את ההתראה אבל היא לא הגיעה לכאן תוך{" "}
            {HEARD_WITHIN_MS / 1000} שניות. זה לא עניין של הגדרות ההתראות
            במכשיר — במצב הזה הן לא רלוונטיות.
          </span>
          <span>
            הסיבה הנפוצה: הרישום הזה נוצר בהתקנה קודמת של האפליקציה. הסירו
            את הסמל ממסך הבית, הוסיפו אותו מחדש, והפעילו התראות שוב.
          </span>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <p
          role="alert"
          className="break-words rounded-xl bg-danger-pastel p-2.5 text-xs font-semibold text-danger-ink"
        >
          {phase.message}
        </p>
      ) : null}

      {inSafari ? (
        <p className="rounded-xl bg-signal-soft p-2.5 text-[0.72rem] leading-relaxed font-semibold text-signal">
          שימו לב: הדף הזה פתוח בספארי ולא מהסמל במסך הבית. באייפון התראה
          נשלחת בהצלחה אך לא מוצגת במצב הזה. פתחו את האפליקציה מהסמל ונסו
          שוב.
        </p>
      ) : null}

      {/* Only when the number is one a person can tell is wrong. Rows pile
          up on every reinstall and nothing removes them, and the count is
          what makes a failed test look like a success. */}
      {devices > 1 && endpoint ? (
        <div className="flex flex-col gap-1.5 rounded-xl bg-sunk p-2.5">
          <span className="text-[0.72rem] leading-relaxed text-ink-soft">
            רשומים {devices} מכשירים על השם שלך. רישומים ישנים נשארים אחרי
            כל התקנה מחדש, וההתראה נשלחת גם אליהם — מה שגורם ל«נשלחה
            בהצלחה» גם כשהמכשיר שבידך לא קיבל דבר.
          </span>
          <button
            type="button"
            onClick={() => void cleanUp()}
            disabled={cleaning}
            className="h-9 rounded-lg border border-rule text-[0.76rem] font-bold text-ink disabled:opacity-60"
          >
            {cleaning ? "מנקה…" : "השאירו רק את המכשיר הזה"}
          </button>
          <span className="text-[0.68rem] leading-relaxed text-ink-faint">
            בטוח: כל מכשיר נרשם מחדש מעצמו בפעם הבאה שפותחים בו את
            האפליקציה.
          </span>
        </div>
      ) : null}
    </section>
  );
}
