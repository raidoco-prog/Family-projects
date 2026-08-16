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

      <JoinForm token={token} />
    </main>
  );
}
