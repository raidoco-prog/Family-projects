"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { signInWithEmail, type LoginState } from "./actions";

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
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
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
      </form>

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-xl bg-danger-pastel p-3 text-center"
        >
          <b className="text-sm font-bold text-danger-ink">ההתחברות נכשלה</b>
          {/* The raw reason. Ugly, English, and the only thing that makes a
              failed login fixable instead of mysterious. */}
          <span className="break-words text-xs text-danger-ink">{error}</span>
        </div>
      ) : null}
    </div>
  );
}
