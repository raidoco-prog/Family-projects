"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  isIos,
  pushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "@/lib/push";
import {
  removePushSubscription,
  savePreferences,
  savePushSubscription,
  type PreferenceUpdate,
} from "./actions";
import type { Preferences } from "./page";

const TYPES: { key: keyof PreferenceUpdate; label: string; hint: string }[] = [
  { key: "appointments", label: "תורים רפואיים", hint: "24 שעות לפני, ושעה לפני" },
  { key: "events", label: "אירועים ובית ספר", hint: "אותם זמנים" },
  { key: "birthdays", label: "ימי הולדת וחגים", hint: "ב-10:30 ביום עצמו" },
  { key: "tasks", label: "משימות", hint: "שעה לפני הדדליין, ואם עבר" },
  { key: "shopping", label: "קניות", hint: "כשמוצר נגמר. הכי רועש" },
  { key: "digest", label: "סיכום בוקר", hint: "הודעה אחת בבוקר" },
];

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-[21px] w-[38px] shrink-0 rounded-full p-0.5 transition ${
        on ? "bg-accent" : "bg-rule"
      }`}
    >
      <span
        className={`block size-[17px] rounded-full bg-surface shadow transition-transform ${
          on ? "-translate-x-[17px]" : ""
        }`}
      />
    </button>
  );
}

export default function SettingsBoard({
  memberName,
  preferences,
  deviceCount,
  vapidPublicKey,
}: {
  memberName: string;
  preferences: Preferences | null;
  deviceCount: number;
  vapidPublicKey: string;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(preferences);
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState(deviceCount);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  function patch(update: PreferenceUpdate) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...update } as Preferences);
    startTransition(async () => {
      const res = await savePreferences(update);
      if (res.error) {
        setPrefs(previous);
        setError(res.error);
      }
    });
  }

  function enable() {
    setError(null);
    startTransition(async () => {
      const res = await subscribeToPush(vapidPublicKey);
      if (!res.ok || !res.subscription) {
        setError(res.error ?? "ההרשמה נכשלה.");
        return;
      }
      const saved = await savePushSubscription({
        ...res.subscription,
        userAgent: navigator.userAgent,
      });
      if (saved.error) {
        setError(saved.error);
        return;
      }
      setDevices((d) => d + 1);
      setState("granted");
      router.refresh();
    });
  }

  function disable() {
    startTransition(async () => {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await removePushSubscription(endpoint);
      setDevices((d) => Math.max(0, d - 1));
      setState("available");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-serif text-2xl font-semibold">התראות</h1>
        <p className="text-[0.82rem] text-ink-faint">ההגדרות של {memberName}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {/* ---- device state ---- */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          המכשיר הזה
        </h2>

        {state === "needs-install" ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-signal/25 bg-signal-soft p-4">
            <b className="text-sm font-bold text-signal">צריך להוסיף למסך הבית</b>
            <p className="text-[0.85rem] leading-relaxed text-ink-soft">
              באייפון, התראות עובדות רק כשהאתר נפתח ממסך הבית. זו מגבלה של
              אפל, לא הגדרה שאפשר לשנות כאן.
            </p>
            <ol className="flex list-decimal flex-col gap-1 ps-4 text-[0.85rem] text-ink-soft">
              <li>לחצו על כפתור השיתוף בתחתית ספארי</li>
              <li>בחרו «הוספה למסך הבית»</li>
              <li>פתחו את האפליקציה מהסמל החדש, וחזרו למסך הזה</li>
            </ol>
          </div>
        ) : state === "granted" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4 shadow-[var(--shadow)]">
            <div className="flex flex-1 flex-col">
              <b className="text-sm font-bold">התראות פעילות</b>
              <span className="text-[0.8rem] text-ink-soft">
                {devices === 1 ? "מכשיר אחד רשום" : `${devices} מכשירים רשומים`}
              </span>
            </div>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="rounded-xl border border-rule px-3 py-1.5 text-[0.8rem] font-semibold text-ink-soft disabled:opacity-60"
            >
              כיבוי
            </button>
          </div>
        ) : state === "denied" ? (
          <div className="rounded-2xl border border-rule bg-surface p-4 text-[0.85rem] text-ink-soft shadow-[var(--shadow)]">
            ההרשאה נחסמה בדפדפן. צריך לאפשר אותה מחדש בהגדרות האתר במכשיר.
          </div>
        ) : state === "unsupported" ? (
          <div className="rounded-2xl border border-rule bg-surface p-4 text-[0.85rem] text-ink-soft shadow-[var(--shadow)]">
            הדפדפן הזה לא תומך בהתראות.
            {isIos() ? " נסו לפתוח מהסמל במסך הבית." : ""}
          </div>
        ) : state === "available" ? (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="h-11 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
          >
            {busy ? "רגע…" : "הפעלת התראות במכשיר הזה"}
          </button>
        ) : (
          <div className="h-11 animate-pulse rounded-xl bg-sunk" />
        )}
      </section>

      {/* ---- per-type ---- */}
      {prefs ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
              מה לקבל
            </h2>
            <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
              {TYPES.map((t) => (
                <li key={t.key} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[0.93rem] font-semibold">{t.label}</span>
                    <span className="text-[0.78rem] text-ink-soft">{t.hint}</span>
                  </div>
                  <Toggle
                    on={Boolean(prefs[t.key as keyof Preferences])}
                    onChange={() =>
                      patch({ [t.key]: !prefs[t.key as keyof Preferences] } as PreferenceUpdate)
                    }
                    label={t.label}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
              שעות שקט
            </h2>
            <div className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]">
              <p className="text-[0.8rem] text-ink-soft">
                בטווח הזה לא נשלחות התראות. הן לא נמחקות — הן ממתינות ויוצאות
                כשהחלון נגמר.
              </p>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[0.74rem] text-ink-soft">מ־</span>
                  <input
                    type="time"
                    value={prefs.quiet_from.slice(0, 5)}
                    onChange={(e) => patch({ quiet_from: e.target.value })}
                    aria-label="תחילת שעות שקט"
                    className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[0.74rem] text-ink-soft">עד</span>
                  <input
                    type="time"
                    value={prefs.quiet_to.slice(0, 5)}
                    onChange={(e) => patch({ quiet_to: e.target.value })}
                    aria-label="סוף שעות שקט"
                    className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[0.74rem] text-ink-soft">סיכום בוקר</span>
                  <input
                    type="time"
                    value={prefs.digest_at.slice(0, 5)}
                    onChange={(e) => patch({ digest_at: e.target.value })}
                    aria-label="שעת סיכום הבוקר"
                    className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm"
                  />
                </label>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          גיבוי
        </h2>
        <div className="flex flex-col gap-2.5 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]">
          <p className="text-[0.82rem] leading-relaxed text-ink-soft">
            הורדת כל נתוני הבית כקובץ אחד — יומן, תורים, משימות, קניות ומלאי.
            שמרו אותו מדי פעם: בתוכנית החינמית של Supabase הגיבויים נשמרים
            לזמן מוגבל.
          </p>
          <a
            href="/api/backup"
            download
            className="grid h-10 place-items-center rounded-xl bg-accent-pastel text-sm font-bold text-accent"
          >
            הורדת גיבוי
          </a>
        </div>
      </section>

      <p className="text-center text-[0.74rem] leading-relaxed text-ink-faint">
        התראה שנחסמה בשעות שקט תישלח כשהחלון נגמר, ולא תיעלם.
      </p>
    </>
  );
}
