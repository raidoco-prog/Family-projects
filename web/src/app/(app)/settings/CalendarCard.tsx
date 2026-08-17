"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { NEXT_COOKIE, NEXT_COOKIE_MAX_AGE } from "@/lib/next-path";
import { syncCalendarNow, type SyncResult } from "./actions";

export interface CalendarStatus {
  connected: boolean;
  google_email: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

function whenText(iso: string | null) {
  if (!iso) return "עוד לא סונכרן";
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

export default function CalendarCard({
  status,
  connectError,
}: {
  status: CalendarStatus;
  connectError?: string;
}) {
  // The callback reports a failed grant through the URL, because at that
  // point there is nowhere in the database to record it.
  const [error, setError] = useState<string | null>(connectError ?? null);
  const [synced, setSynced] = useState<SyncResult | null>(null);
  const [busy, start] = useTransition();

  function syncNow() {
    start(async () => {
      setError(null);
      const result = await syncCalendarNow();
      if (result.error) setError(result.error);
      else setSynced(result);
    });
  }

  function connect() {
    start(async () => {
      // Same reason as the login button: a query string on redirectTo has
      // to be matched by the Supabase allow list, and a miss is silently
      // replaced by the Site URL rather than reported.
      document.cookie =
        `${NEXT_COOKIE}=${encodeURIComponent("/settings")}; path=/; ` +
        `max-age=${NEXT_COOKIE_MAX_AGE}; SameSite=Lax`;

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "https://www.googleapis.com/auth/calendar.readonly",
          queryParams: {
            // Google issues a refresh token only with offline access, and
            // only on a round trip that actually shows consent. Without
            // both, the grant works once and the sync has nothing to run
            // on afterwards.
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) setError(error.message);
    });
  }

  function disconnect() {
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("calendar_disconnect");
      if (error) setError(error.message);
      else window.location.reload();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-bold">יומן גוגל</h2>
        <p className="text-xs text-ink-soft">
          האירועים מהיומן שלך יופיעו כאן ויתעדכנו לבד. הכיוון אחד — שינוי
          שתעשו באפליקציה לא נכתב חזרה לגוגל.
        </p>
      </header>

      {status.connected ? (
        <>
          <dl className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-faint">חשבון</dt>
              <dd className="break-all font-semibold">{status.google_email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-faint">סונכרן לאחרונה</dt>
              <dd className="font-semibold">{whenText(status.last_synced_at)}</dd>
            </div>
          </dl>

          {status.last_error ? (
            <div className="flex flex-col gap-1 rounded-xl bg-danger-pastel p-3">
              <b className="text-xs font-bold text-danger-ink">הסנכרון האחרון נכשל</b>
              <span className="break-words text-[0.7rem] text-danger-ink">
                {status.last_error}
              </span>
            </div>
          ) : null}

          {synced ? (
            <p className="rounded-xl bg-accent-pastel p-2.5 text-center text-xs font-bold text-accent">
              {synced.imported
                ? `${synced.imported} אירועים סונכרנו`
                : "אין שינויים חדשים ביומן"}
              {synced.removed ? ` · ${synced.removed} נמחקו` : ""}
            </p>
          ) : null}

          <button
            type="button"
            onClick={syncNow}
            disabled={busy}
            className="h-9 rounded-xl bg-accent-pastel text-xs font-bold text-accent disabled:opacity-60"
          >
            {busy ? "מסנכרן…" : "סנכרון עכשיו"}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="h-9 flex-1 rounded-xl border border-rule text-xs font-bold text-ink disabled:opacity-60"
            >
              חיבור מחדש
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="h-9 flex-1 rounded-xl bg-danger-pastel text-xs font-bold text-danger-ink disabled:opacity-60"
            >
              ניתוק
            </button>
          </div>
          <p className="text-[0.7rem] text-ink-faint">
            ניתוק מוחק את ההרשאה בלבד. האירועים שכבר נכנסו נשארים.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="h-10 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
        >
          {busy ? "רגע…" : "חיבור יומן גוגל"}
        </button>
      )}

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-xl bg-danger-pastel p-3"
        >
          <b className="text-xs font-bold text-danger-ink">החיבור לא נשמר</b>
          <span className="break-words text-[0.7rem] text-danger-ink">{error}</span>
          {/nSUPABASE_SERVICE_ROLE_KEY|service.role/i.test(error) ? (
            <span className="text-[0.7rem] text-danger-ink">
              חסר המשתנה SUPABASE_SERVICE_ROLE_KEY ב-Vercel. הוסיפו אותו
              מ-Supabase → Settings → API, פרסו מחדש, ונסו שוב.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
