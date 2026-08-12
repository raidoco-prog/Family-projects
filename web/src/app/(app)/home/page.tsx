import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import MemberAvatar from "@/components/MemberAvatar";
import type { InventoryItem, ShoppingItem, Task } from "@/lib/types";

function greeting(hour: number) {
  if (hour < 11) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  if (hour < 21) return "ערב טוב";
  return "לילה טוב";
}

const NEXT_STEPS = [
  { phase: "שלב 4", text: "התראות פוש לטלפון" },
  { phase: "שלב 5", text: "מצב אופליין וליטוש" },
];

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null;

  const { member, members } = session;
  const now = new Date();
  const pending = members.filter((m) => !m.user_id);

  const supabase = await createClient();
  const [{ data: shopping }, { data: inventory }, { data: myTasks }] = await Promise.all([
    supabase
      .from("shopping_items")
      .select("id,is_checked")
      .eq("household_id", session.household.id)
      .eq("is_checked", false)
      .returns<Pick<ShoppingItem, "id" | "is_checked">[]>(),
    supabase
      .from("inventory_items")
      .select("id,name,quantity,min_quantity,unit,storage_location")
      .eq("household_id", session.household.id)
      .returns<
        Pick<
          InventoryItem,
          "id" | "name" | "quantity" | "min_quantity" | "unit" | "storage_location"
        >[]
      >(),
    supabase
      .from("tasks")
      .select("id,title,due_at,priority,status")
      .eq("household_id", session.household.id)
      .eq("assignee_id", member.id)
      .in("status", ["open", "in_progress"])
      .order("due_at", { nullsFirst: false })
      .returns<Pick<Task, "id" | "title" | "due_at" | "priority" | "status">[]>(),
  ]);

  const openShopping = shopping?.length ?? 0;
  const lowStock = (inventory ?? []).filter((i) => i.quantity <= i.min_quantity);

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

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/tasks"
          className="flex flex-col rounded-2xl border border-rule bg-surface p-3 shadow-[var(--shadow)]"
        >
          <b className="text-2xl font-bold leading-tight tabular-nums">
            {myTasks?.length ?? 0}
          </b>
          <span className="text-[0.74rem] text-ink-soft">משימות פתוחות שלי</span>
        </Link>
        <Link
          href="/shopping"
          className="flex flex-col rounded-2xl border border-rule bg-surface p-3 shadow-[var(--shadow)]"
        >
          <b className="text-2xl font-bold leading-tight tabular-nums">
            {openShopping}
          </b>
          <span className="text-[0.74rem] text-ink-soft">
            פריטים ברשימת קניות
          </span>
        </Link>
        <Link
          href="/inventory"
          className={`flex flex-col rounded-2xl border p-3 shadow-[var(--shadow)] ${
            lowStock.length
              ? "border-signal/35 bg-signal-soft"
              : "border-rule bg-surface"
          }`}
        >
          <b
            className={`text-2xl font-bold leading-tight tabular-nums ${
              lowStock.length ? "text-signal" : ""
            }`}
          >
            {lowStock.length}
          </b>
          <span className="text-[0.74rem] text-ink-soft">מוצרים שנגמרים</span>
        </Link>
      </div>

      {lowStock.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            נגמר בבית
          </h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {lowStock.slice(0, 5).map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[0.93rem] font-semibold">
                    {i.name}
                  </span>
                  <span className="text-[0.78rem] text-ink-soft tabular-nums">
                    {i.storage_location} · נשארו {i.quantity} {i.unit}
                  </span>
                </div>
                <span className="rounded-full bg-signal-pastel px-2 py-0.5 text-[0.66rem] font-bold text-signal">
                  חסר
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {myTasks?.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            המשימות שלי
          </h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {myTasks.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  aria-hidden="true"
                  className={`h-6 w-[3px] shrink-0 rounded-sm ${
                    t.priority === 1 ? "bg-danger" : t.priority === 2 ? "bg-signal" : "bg-rule"
                  }`}
                />
                <span className="flex-1 truncate text-[0.93rem] font-semibold">
                  {t.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
        שלבים 0–3 הושלמו: משק בית, קניות ומלאי, יומן ותורים, ומשימות.
      </p>
    </>
  );
}
