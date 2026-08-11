"use client";

import { useActionState, useEffect, useState } from "react";
import { createInvite, type FamilyState } from "./actions";

export default function InviteButton({
  memberId,
  memberName,
  existingToken,
}: {
  memberId: string;
  memberName: string;
  existingToken?: string;
}) {
  const [state, action, pending] = useActionState<FamilyState, FormData>(
    createInvite,
    existingToken ? { inviteUrl: `/join/${existingToken}` } : {},
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard is blocked outside a secure context — show the link
      // so it can still be copied by hand.
      window.prompt(`הקישור עבור ${memberName}:`, url);
    }
  }

  if (state.inviteUrl) {
    return (
      <button
        type="button"
        onClick={() => copy(state.inviteUrl!)}
        className="rounded-full bg-accent-pastel px-2.5 py-1 text-[0.7rem] font-bold text-accent"
      >
        {copied ? "הועתק" : "העתקת קישור"}
      </button>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="member_id" value={memberId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-rule bg-surface px-2.5 py-1 text-[0.7rem] font-bold text-ink-soft disabled:opacity-60"
      >
        {pending ? "רגע…" : "הזמנה"}
      </button>
    </form>
  );
}
