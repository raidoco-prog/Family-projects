const STEPS = [
  {
    title: "צרו פרויקט ב-Supabase",
    body: "אזור eu-central-1 (פרנקפורט) הוא הקרוב ביותר לישראל.",
  },
  {
    title: "הריצו את הסכימה",
    body: "העתיקו את docs/schema.sql אל ה-SQL Editor והריצו. זה יוצר את הטבלאות, הטריגרים ומדיניות ההרשאות.",
  },
  {
    title: "הפעילו התחברות",
    body: "Authentication → Providers → Google, ובנוסף Magic Link למי שאין לו חשבון גוגל.",
  },
  {
    title: "מלאו את web/.env.local",
    body: "העתיקו את web/.env.example והשלימו את שני הערכים מ-Settings → API.",
  },
];

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-faint">
          הגדרה נדרשת
        </span>
        <h1 className="font-serif text-3xl font-medium">
          חסרים פרטי החיבור ל-Supabase
        </h1>
        <p className="text-ink-soft">
          האפליקציה לא תפעל עד שיוגדרו{" "}
          <code className="rounded bg-sunk px-1.5 py-0.5 text-sm" dir="ltr">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          ו-
          <code className="rounded bg-sunk px-1.5 py-0.5 text-sm" dir="ltr">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>
          .
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-xl border border-rule bg-surface p-4"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-pastel text-sm font-bold text-accent tabular-nums">
              {i + 1}
            </span>
            <div className="flex flex-col gap-0.5">
              <b className="text-sm font-bold">{step.title}</b>
              <span className="text-sm text-ink-soft">{step.body}</span>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-sm text-ink-faint">
        אחרי מילוי הקובץ יש להפעיל מחדש את שרת הפיתוח.
      </p>
    </main>
  );
}
