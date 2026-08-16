"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { claimInvite, type JoinState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
    >
      {pending ? "רגע…" : "הצטרפות לבית"}
    </button>
  );
}

export default function JoinForm({ token }: { token: string }) {
  const [state, action] = useActionState<JoinState, FormData>(claimInvite, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">
          השם שלך{" "}
          <span className="font-normal text-ink-faint">(אפשר להשאיר ריק)</span>
        </span>
        <input
          name="name"
          placeholder="אם ריק, יישאר השם שההורה הגדיר"
          className="h-11 rounded-xl border border-rule bg-surface px-3 text-sm placeholder:text-ink-faint"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
