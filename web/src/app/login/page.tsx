import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="font-serif text-3xl font-semibold">הבית שלנו</h1>
        <p className="text-sm text-ink-soft">
          יומן, משימות, תורים, קניות ומלאי — במקום אחד
        </p>
      </header>

      <Suspense>
        <LoginForm next={next ?? "/"} />
      </Suspense>

      <p className="text-center text-xs leading-relaxed text-ink-faint">
        בפעם הראשונה באייפון, הוסיפו את האפליקציה למסך הבית —
        <br />
        בלי זה התזכורות לא יגיעו.
      </p>
    </main>
  );
}
