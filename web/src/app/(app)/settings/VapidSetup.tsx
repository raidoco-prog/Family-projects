"use client";

import { useState } from "react";

/**
 * Generates a VAPID key pair in the browser.
 *
 * Push needs a key pair, and the documented way to get one is
 * `npx web-push generate-vapid-keys` — which needs a terminal, and a laptop,
 * and a working Node install. That is the last step of setting this app up
 * and it was the only one a person could not do from the phone they were
 * holding, so it was where the notifications stalled.
 *
 * A VAPID pair is an ECDSA P-256 key with the public half as the raw
 * uncompressed point and the private half as the JWK `d` value, both
 * base64url. Web Crypto produces exactly that. Checked against the
 * web-push library that will consume it: same lengths as its own output,
 * accepted by setVapidDetails, and able to sign a real push request.
 *
 * The private key is generated here and never sent anywhere — it goes from
 * this screen to the hosting provider's settings and nowhere else.
 */

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

interface Pair {
  publicKey: string;
  privateKey: string;
  cronSecret: string;
}

function Field({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked outside a secure context; the value is on
      // screen and selectable, so this is not a dead end.
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <code className="text-[0.68rem] font-bold text-ink-soft" dir="ltr">
          {name}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-full bg-accent-pastel px-2.5 py-1 text-[0.68rem] font-bold text-accent"
        >
          {copied ? "הועתק" : "העתקה"}
        </button>
      </div>
      <code
        dir="ltr"
        className="select-all break-all rounded-lg bg-sunk p-2 text-[0.62rem] leading-relaxed text-ink"
      >
        {value}
      </code>
    </div>
  );
}

export type KeyVerdict = "ok" | "missing" | "malformed" | "not-a-pair";

export interface EnvSeen {
  publicKey: boolean;
  privateKey: boolean;
  cronSecret: boolean;
}

/**
 * What the running server can see, and what that combination means.
 *
 * On Vercel an environment variable is bound when a deployment is built.
 * Saving one in the dashboard changes nothing that is already running —
 * only the next deployment picks it up. That is why "I added the keys and
 * it still says they are missing" is the expected result rather than a
 * surprise, and why saying which names arrived is worth more than
 * repeating that one is absent.
 */
function Diagnosis({ seen, verdict }: { seen: EnvSeen; verdict: KeyVerdict }) {
  const rows: [string, boolean][] = [
    ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", seen.publicKey],
    ["VAPID_PRIVATE_KEY", seen.privateKey],
    ["CRON_SECRET", seen.cronSecret],
  ];
  const none = rows.every(([, ok]) => !ok);
  const some = rows.some(([, ok]) => ok);

  // Present is not the same as usable, and this is the case where saying
  // "✗ missing" would be actively misleading: both keys arrived, both look
  // right, and they still cannot sign anything.
  const paired =
    verdict === "not-a-pair"
      ? "שניהם הגיעו — אבל הם אינם זוג. זה קורה כשיוצרים מפתחות יותר מפעם אחת ומעתיקים את הציבורי מיצירה אחת ואת הפרטי מאחרת. צרו זוג חדש כאן והחליפו את שניהם."
      : verdict === "malformed"
        ? "אחד המפתחות אינו קריא — כנראה הועתק חלקית, או שנשמר עם גרשיים. צרו זוג חדש כאן והחליפו את שניהם."
        : null;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-sunk p-3">
      <b className="text-[0.74rem] font-bold text-ink-soft">
        מה השרת רואה כרגע
      </b>

      <ul className="flex flex-col gap-1">
        {rows.map(([name, ok]) => (
          <li key={name} className="flex items-center justify-between gap-2">
            <code className="text-[0.62rem] text-ink-soft" dir="ltr">
              {name}
            </code>
            <span
              className={`text-[0.7rem] font-bold ${ok ? "text-accent" : "text-danger-ink"}`}
            >
              {ok ? "✓ קיים" : "✗ חסר"}
            </span>
          </li>
        ))}
      </ul>

      <p
        className={`text-[0.72rem] leading-relaxed ${paired ? "font-semibold text-danger-ink" : "text-ink-soft"}`}
      >
        {paired
          ? paired
          : none
            ? "אף אחד מהם לא הגיע. אם כבר הוספתם אותם ב-Vercel — חסר Redeploy: משתנה נקבע בזמן הבנייה, ופריסה שכבר רצה לא מכירה אותו."
            : some && !seen.publicKey
              ? "השאר הגיעו, וזה דווקא אומר שהפריסה עדכנית. בדקו את השם של החסר — הוא חייב להיות בדיוק NEXT_PUBLIC_VAPID_PUBLIC_KEY, כולל הקידומת."
              : "חלק הגיעו. השלימו את החסרים ופרסו מחדש."}
      </p>
    </div>
  );
}

export default function VapidSetup({
  seen,
  verdict,
}: {
  seen: EnvSeen;
  verdict: KeyVerdict;
}) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      // Web Crypto only exists in a secure context. Over https this is
      // always there; opened over plain http — a phone pointed at a laptop
      // on the same network, say — it is simply absent, and without this
      // check that surfaces as "Cannot read properties of undefined".
      if (!crypto?.subtle) {
        throw new Error(
          "יצירת מפתחות דורשת חיבור מאובטח (https). פתחו את הכתובת הרגילה של האפליקציה.",
        );
      }

      const kp = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      const raw = await crypto.subtle.exportKey("raw", kp.publicKey);
      const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
      if (!jwk.d) throw new Error("the private half came back empty");

      // The cron's shared secret, while we are here — it is the other
      // value that needs generating and it is just random bytes.
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const cronSecret = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      setPair({ publicKey: b64url(raw), privateKey: jwk.d, cronSecret });
    } catch (err) {
      setError(err instanceof Error ? err.message : "היצירה נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">
          {verdict === "missing" ? "יצירת מפתחות ההתראות" : "המפתחות צריכים החלפה"}
        </h2>
        <p className="text-xs leading-relaxed text-ink-soft">
          {verdict === "missing"
            ? "התראות דורשות זוג מפתחות. אפשר ליצור אותו כאן, בטלפון — הוא נוצר במכשיר שלך ולא נשלח לשום מקום."
            : "המפתחות שמוגדרים כרגע אינם יכולים לחתום על התראה. צרו זוג חדש כאן — הוא נוצר במכשיר שלך ולא נשלח לשום מקום."}
        </p>
      </header>

      <Diagnosis seen={seen} verdict={verdict} />

      {pair ? (
        <>
          <div className="flex flex-col gap-3">
            <Field name="NEXT_PUBLIC_VAPID_PUBLIC_KEY" value={pair.publicKey} />
            <Field name="VAPID_PRIVATE_KEY" value={pair.privateKey} />
            {/* Only when there is not one already. A CRON_SECRET that works
                is shared with a schedule inside the database, and replacing
                it here means the cron starts being turned away at the door
                — a second fault, introduced while fixing the first, and
                nothing on this screen would connect the two. */}
            {seen.cronSecret ? null : (
              <Field name="CRON_SECRET" value={pair.cronSecret} />
            )}
          </div>

          <ol className="flex list-inside list-decimal flex-col gap-1.5 text-xs leading-relaxed text-ink-soft">
            <li>
              {seen.cronSecret
                ? "החליפו את שני הערכים האלה במשתני הסביבה ב-Vercel."
                : "הוסיפו את שלושתם למשתני הסביבה ב-Vercel."}
            </li>
            <li>
              <b>Redeploy</b> — בלעדיו הם לא קיימים מבחינת האפליקציה.
            </li>
            {seen.cronSecret ? null : (
              <li>
                הריצו את <code dir="ltr">cron.sql</code> ב-Supabase עם אותו{" "}
                <code dir="ltr">CRON_SECRET</code>.
              </li>
            )}
            <li>
              {seen.cronSecret
                ? "פתחו את האפליקציה בטלפון — המכשיר יירשם מחדש מעצמו."
                : "חזרו לכאן ולחצו «הפעלת התראות במכשיר הזה»."}
            </li>
          </ol>

          <p className="rounded-xl bg-danger-pastel p-2.5 text-[0.7rem] leading-relaxed text-danger-ink">
            {seen.cronSecret ? "המפתח הפרטי הוא סוד" : "שני האחרונים הם סודות"}.
            העתיקו ישירות לשדה ב-Vercel — לא דרך צ׳אט, מסמך או מייל. אם הדף
            נסגר לפני שהעתקתם, פשוט צרו זוג חדש; אף אחד לא משתמש בהם עדיין.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="h-10 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
        >
          {busy ? "רגע…" : "יצירת מפתחות"}
        </button>
      )}

      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}
