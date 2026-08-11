import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  // Already in a household — nothing to set up.
  if (await getSession()) redirect("/home");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-7 p-6">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">
          הקמה
        </span>
        <h1 className="font-serif text-3xl font-semibold">נקים את הבית</h1>
        <p className="text-sm text-ink-soft">
          אתם תהיו ההורה הראשון. את שאר בני המשפחה אפשר להוסיף מיד אחר כך.
        </p>
      </header>

      <OnboardingForm />
    </main>
  );
}
