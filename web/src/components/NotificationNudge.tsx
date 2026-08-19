"use client";

import { useEffect, useState } from "react";
import {
  currentSubscription,
  isIos,
  pushSnoozeUntil,
  pushState,
  shouldAskAboutPush,
  subscribeToPush,
  type PushState,
} from "@/lib/push";
import { savePushSubscription } from "@/app/(app)/settings/actions";

/**
 * Brings the one unavoidable tap to the family instead of hiding it.
 *
 * The key pair is generated once for the whole app. What cannot be done
 * once, or done for anybody else, is the permission itself: a browser will
 * only grant it in response to a gesture on that device, and Apple will not
 * grant it at all until the app has been added to the home screen. There is
 * no arrangement of code that removes that tap.
 *
 * What was removable is the expectation that a person would go looking for
 * it. Nothing asked, so notifications stayed off for everyone who did not
 * think to open Settings and scroll.
 *
 * It says nothing at all when there is nothing to be done — already
 * subscribed, or a browser with no Push API — and it takes "later" for an
 * answer rather than asking again on the next screen.
 */

const SNOOZE_KEY = "fp_push_snoozed_until";

function snoozedNow(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export default function NotificationNudge({
  vapidPublicKey,
}: {
  vapidPublicKey: string;
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Nothing is worth showing before we know the answer, and the answer
    // is only knowable in the browser.
    if (!vapidPublicKey || snoozedNow()) return;
    void pushState().then(async (s) => {
      setState(s);
      setHidden(!shouldAskAboutPush(s));

      // A device this prompt already turned on was never registered with
      // the server, because this prompt used to stop at the browser. Those
      // devices show as subscribed and receive nothing, and their owners
      // have no reason to suspect it — they pressed the button and it went
      // away. Re-registering is idempotent and costs one call, so the
      // repair happens where the damage was done.
      if (s !== "granted") return;
      const sub = await currentSubscription();
      if (sub) {
        void savePushSubscription({ ...sub, userAgent: navigator.userAgent });
      }
    });
  }, [vapidPublicKey]);

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(pushSnoozeUntil(Date.now())));
    } catch {
      // Private browsing. Hiding it for this session is still an answer.
    }
    setHidden(true);
  }

  async function enable() {
    setBusy(true);
    setError(null);

    const result = await subscribeToPush(vapidPublicKey);
    if (!result.ok || !result.subscription) {
      setBusy(false);
      setError(result.error ?? "ההרשמה נכשלה.");
      setState(await pushState());
      return;
    }

    // The browser accepting the subscription is half of it. Without this
    // the permission is granted, the prompt disappears, and nothing is
    // ever delivered — which is worse than never having asked.
    const saved = await savePushSubscription({
      ...result.subscription,
      userAgent: navigator.userAgent,
    });
    setBusy(false);

    if (saved.error) setError(saved.error);
    else setHidden(true);
  }

  if (hidden || !state) return null;

  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <b className="text-[0.88rem] font-bold">התראות כבויות במכשיר הזה</b>
          <p className="text-[0.76rem] leading-relaxed text-ink-soft">
            {state === "needs-install"
              ? "באייפון, התראות עובדות רק כשהאפליקציה נפתחת מהסמל במסך הבית."
              : state === "denied"
                ? "ההרשאה נחסמה. אפשר להחזיר אותה בהגדרות האתר במכשיר."
                : "בלי זה לא יגיעו תזכורות על תורים, משימות וימי הולדת."}
          </p>
        </div>
        <button
          type="button"
          onClick={snooze}
          aria-label="לא עכשיו"
          className="shrink-0 rounded-full px-2 py-1 text-[0.7rem] font-bold text-ink-faint"
        >
          לא עכשיו
        </button>
      </div>

      {state === "needs-install" ? (
        <ol className="flex list-inside list-decimal flex-col gap-1 text-[0.76rem] leading-relaxed text-ink-soft">
          <li>לחצו על כפתור השיתוף בתחתית ספארי</li>
          <li>בחרו «הוספה למסך הבית»</li>
          <li>פתחו את האפליקציה מהסמל החדש וחזרו לכאן</li>
        </ol>
      ) : state === "denied" ? null : (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="h-10 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
        >
          {busy ? "רגע…" : "הפעלת התראות"}
        </button>
      )}

      {/* iOS is the only place the install step exists, and saying so stops
          an Android reader from hunting for a button that is not there. */}
      {state === "needs-install" && !isIos() ? (
        <p className="text-[0.72rem] text-ink-faint">
          במכשירי אנדרואיד אפשר להתקין דרך תפריט הדפדפן.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-[0.76rem] font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}
