"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { signInWithEmail, type LoginState } from "./actions";
import { NEXT_COOKIE, NEXT_COOKIE_MAX_AGE } from "@/lib/next-path";
import { explainAuthError } from "@/lib/auth-errors";

const base =
  "flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold transition disabled:opacity-60";
const primary = "bg-accent-pastel text-accent";
const ghost = "border border-rule bg-surface text-ink";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${base} ${ghost}`}>
      {pending ? "רגע…" : children}
    </button>
  );
}

export default function LoginForm({
  next,
  refusal,
}: {
  next: string;
  refusal?: string;
}) {
  const [emailState, emailAction] = useActionState(
    signInWithEmail,
    {} as LoginState,
  );
  const [googleError, setGoogleError] = useState<string | undefined>(refusal);
  const [redirecting, startRedirect] = useTransition();

  /**
   * Deliberately run in the browser rather than in a Server Action.
   *
   * supabase-js sets the PKCE verifier cookie and then navigates itself, so
   * the round trip never depends on a Server Action's redirect surviving to
   * an external origin. It also builds the return address from the host the
   * family actually opened, which makes a wrong NEXT_PUBLIC_SITE_URL unable
   * to strand them on localhost.
   */
  function signInWithGoogle() {
    startRedirect(async () => {
      // SameSite=Lax survives the top-level GET that Google sends us back
      // on, which is exactly the trip this has to outlive.
      document.cookie =
        `${NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; ` +
        `max-age=${NEXT_COOKIE_MAX_AGE}; SameSite=Lax`;

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Bare, with no query string: see lib/next-path.ts.
          redirectTo: `${window.location.origin}/auth/callback`,
          // Without this, Google silently reuses the single account already
          // signed in on the device and shows no picker at all. On a phone
          // or tablet set up with a parent's account, every child who opens
          // an invite is signed in as that parent — and nothing on screen
          // says so. One extra tap for everyone else is worth it.
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) setGoogleError(error.message);
    });
  }

  if (emailState.sent) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-rule bg-surface p-5 text-center">
        <b className="text-sm font-bold">הקישור נשלח</b>
        <p className="text-sm text-ink-soft">
          שלחנו קישור כניסה אל {emailState.sent}. הוא תקף לשעה.
        </p>
      </div>
    );
  }

  const error = googleError ?? emailState.error;
  const explained = error ? explainAuthError(error) : null;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={redirecting}
        className={`${base} ${primary}`}
      >
        {redirecting ? "רגע…" : "המשך עם גוגל"}
      </button>

      <div className="flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-rule" />
        או
        <span className="h-px flex-1 bg-rule" />
      </div>

      <form action={emailAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="כתובת אימייל"
          aria-label="כתובת אימייל"
          className="h-11 rounded-xl border border-rule bg-surface px-3 text-sm text-ink placeholder:text-ink-faint"
        />
        <Submit>שלחו לי קישור כניסה</Submit>
        {/* Said plainly, because the alternative is discovering it as a
            failure. The built-in mailer allows a few messages an hour and
            in a new project delivers only to the project's own members —
            so for everyone else this route is a dead end, and the button
            above is the one that works. */}
        <p className="text-center text-[0.7rem] leading-relaxed text-ink-faint">
          הקישור במייל מוגבל לכמה שליחות בשעה. אם יש לכם חשבון גוגל,
          הכפתור למעלה מהיר ואמין יותר.
        </p>
      </form>

      {explained ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl bg-danger-pastel p-3 text-center"
        >
          <b className="text-sm font-bold text-danger-ink">{explained.message}</b>

          {explained.hint ? (
            <span className="text-xs text-danger-ink">{explained.hint}</span>
          ) : null}

          {/* When Google would have worked, put it within reach rather than
              asking somebody to find their way back up the screen. */}
          {explained.suggestGoogle ? (
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={redirecting}
              className="h-10 rounded-xl bg-surface text-sm font-bold text-accent disabled:opacity-60"
            >
              המשך עם גוגל
            </button>
          ) : null}

          {/* The original, kept small. It is what makes the next report
              diagnosable, and it is not what the reader needs first. */}
          <span className="break-words text-[0.68rem] text-danger-ink/70">
            {error}
          </span>
        </div>
      ) : null}
    </div>
  );
}
