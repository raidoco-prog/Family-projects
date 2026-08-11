import Link from "next/link";
import { getSession } from "@/lib/session";
import MemberAvatar from "@/components/MemberAvatar";

function greeting(hour: number) {
  if (hour < 11) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  if (hour < 21) return "ערב טוב";
  return "לילה טוב";
}

const NEXT_STEPS = [
  { phase: "שלב 1", text: "רשימת קניות ומלאי הבית" },
  { phase: "שלב 2", text: "יומן, תורים רפואיים ותזכורות" },
  { phase: "שלב 3", text: "משימות עם אחראי" },
];

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null;

  const { member, members } = session;
  const now = new Date();
  const pending = members.filter((m) => !m.user_id);

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-serif text-2xl font-semibold">
          {greeting(now.getHours())}, {member.display_name}
        </h1>
        <p className="text-[0.82rem] text-ink-faint">
          {members.length} בני בית מחוברים למערכת
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          המשפחה
        </h2>
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <MemberAvatar member={m} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[0.93rem] font-semibold">
                  {m.display_name}
                </span>
                <span className="text-[0.78rem] text-ink-soft">
                  {m.role === "parent" ? "הורה" : "ילד/ה"}
                </span>
              </div>
              {m.user_id ? null : (
                <span className="rounded-full bg-signal-pastel px-2 py-0.5 text-[0.66rem] font-bold text-signal">
                  ממתין להצטרפות
                </span>
              )}
            </li>
          ))}
        </ul>
        <Link
          href="/family"
          className="self-start text-[0.82rem] font-semibold text-accent underline underline-offset-4"
        >
          {pending.length > 0
            ? `שליחת הזמנה ל-${pending.length} בני משפחה`
            : "ניהול בני המשפחה"}
        </Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          מה בדרך
        </h2>
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
          {NEXT_STEPS.map((s) => (
            <li key={s.phase} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="rounded-full bg-accent-pastel px-2 py-0.5 text-[0.66rem] font-bold text-accent">
                {s.phase}
              </span>
              <span className="text-[0.88rem] text-ink-soft">{s.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="pt-1 text-center text-[0.74rem] leading-relaxed text-ink-faint">
        שלב 0 הושלם: התחברות, משק בית, בני משפחה וניווט.
      </p>
    </>
  );
}
