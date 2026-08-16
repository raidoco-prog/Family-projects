"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithEmail, signInWithGoogle, type LoginState } from "./actions";

function Submit({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  const base =
    "flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold transition disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-accent-pastel text-accent"
      : "border border-rule bg-surface text-ink";

  return (
    <button type="submit" disabled={pending} className={`${base} ${styles}`}>
      {pending ? "רגע…" : children}
    </button>
  );
}

export default function LoginForm({ next }: { next: string }) {
  const initial: LoginState = {};
  const [googleState, googleAction] = useActionState(signInWithGoogle, initial);
  const [emailState, emailAction] = useActionState(signInWithEmail, initial);

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

  const error = googleState.error ?? emailState.error;

  return (
    <div className="flex flex-col gap-4">
      <form action={googleAction}>
        <input type="hidden" name="next" value={next} />
        <Submit>המשך עם גוגל</Submit>
      </form>

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
        <Submit variant="ghost">שלחו לי קישור כניסה</Submit>
      </form>

      {error ? (
        <p role="alert" className="text-center text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
