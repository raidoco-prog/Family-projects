import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JoinForm from "./JoinForm";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sign in first, then come straight back to this invite.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="font-serif text-3xl font-semibold">הזמנה למשפחה</h1>
        <p className="text-sm text-ink-soft">
          קיבלתם קישור הצטרפות. אישור יקשר את החשבון שלכם לבית.
        </p>
      </header>

      {/* Which account is about to be bound to this invite. On a shared
          phone or tablet this is very often not the person holding it,
          and the invite is single-use — so it has to be said before the
          button, not after. */}
      <div className="flex flex-col items-center gap-2 rounded-xl border border-rule bg-surface p-4 text-center">
        <span className="text-xs text-ink-faint">מחוברים כרגע כ־</span>
        <b className="break-all text-sm font-bold">{user.email}</b>
        <form action="/auth/signout" method="post">
          <input type="hidden" name="next" value={`/join/${token}`} />
          <button
            type="submit"
            className="text-xs font-bold text-accent underline underline-offset-2"
          >
            זה לא אני — התחברות עם חשבון אחר
          </button>
        </form>
      </div>

      <JoinForm token={token} />
    </main>
  );
}
