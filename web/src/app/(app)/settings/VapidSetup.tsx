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

export default function VapidSetup() {
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
        <h2 className="text-sm font-bold">יצירת מפתחות ההתראות</h2>
        <p className="text-xs leading-relaxed text-ink-soft">
          התראות דורשות זוג מפתחות. אפשר ליצור אותו כאן, בטלפון — הוא נוצר
          במכשיר שלך ולא נשלח לשום מקום.
        </p>
      </header>

      {pair ? (
        <>
          <div className="flex flex-col gap-3">
            <Field name="NEXT_PUBLIC_VAPID_PUBLIC_KEY" value={pair.publicKey} />
            <Field name="VAPID_PRIVATE_KEY" value={pair.privateKey} />
            <Field name="CRON_SECRET" value={pair.cronSecret} />
          </div>

          <ol className="flex list-inside list-decimal flex-col gap-1.5 text-xs leading-relaxed text-ink-soft">
            <li>הוסיפו את שלושתם למשתני הסביבה ב-Vercel.</li>
            <li>
              <b>Redeploy</b> — בלעדיו הם לא קיימים מבחינת האפליקציה.
            </li>
            <li>
              הריצו את <code dir="ltr">cron.sql</code> ב-Supabase עם אותו{" "}
              <code dir="ltr">CRON_SECRET</code>.
            </li>
            <li>חזרו לכאן ולחצו «הפעלת התראות במכשיר הזה».</li>
          </ol>

          <p className="rounded-xl bg-danger-pastel p-2.5 text-[0.7rem] leading-relaxed text-danger-ink">
            שני האחרונים הם סודות. העתיקו אותם ישירות לשדה ב-Vercel — לא
            דרך צ׳אט, מסמך או מייל. אם הדף נסגר לפני שהעתקתם, פשוט צרו זוג
            חדש; אף אחד לא משתמש בהם עדיין.
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
