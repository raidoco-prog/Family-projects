import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { nowIn, relDay, startOfDay, zonedDate } from "@/lib/calendar";
import SearchField from "./SearchField";
import type { CalendarEvent, InventoryItem, ShoppingItem, Task } from "@/lib/types";

/**
 * One box over all four modules.
 *
 * The point of the app is that a thing entered once shows up wherever it is
 * relevant — which is worth little if finding it again means remembering
 * which screen it was on. "טופס 17" is a doctor's appointment to one person
 * and a task to another.
 */

interface Hit {
  key: string;
  title: string;
  where: string;
  detail: string | null;
  href: string;
}

/** Escapes the PostgREST `or` filter grammar: commas and parens split it. */
function escapeForOr(term: string) {
  return term.replace(/[,()\\]/g, " ").trim();
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const { q = "" } = await searchParams;
  const term = q.trim();
  const timeZone = session.household.timezone || "Asia/Jerusalem";
  const today = startOfDay(nowIn(timeZone));

  let hits: Hit[] = [];
  let searched = false;

  // Two characters is the shortest term worth running four queries for.
  if (term.length >= 2) {
    searched = true;
    const safe = escapeForOr(term);
    const like = `%${safe}%`;
    const supabase = await createClient();
    const household = session.household.id;
    const memberById = new Map(session.members.map((m) => [m.id, m.display_name]));

    const [events, tasks, shopping, inventory] = await Promise.all([
      supabase
        .from("events")
        .select("id,title,kind,starts_at,location,description")
        .eq("household_id", household)
        .or(`title.ilike.${like},location.ilike.${like},description.ilike.${like}`)
        .order("starts_at", { ascending: false })
        .limit(20)
        .returns<Pick<CalendarEvent, "id" | "title" | "kind" | "starts_at" | "location" | "description">[]>(),
      supabase
        .from("tasks")
        .select("id,title,notes,due_at,status,assignee_id")
        .eq("household_id", household)
        .or(`title.ilike.${like},notes.ilike.${like}`)
        .limit(20)
        .returns<(Pick<Task, "id" | "title" | "notes" | "due_at" | "status"> & { assignee_id: string | null })[]>(),
      supabase
        .from("shopping_items")
        .select("id,name,quantity,unit,is_checked")
        .eq("household_id", household)
        .ilike("name", like)
        .limit(20)
        .returns<Pick<ShoppingItem, "id" | "name" | "quantity" | "unit" | "is_checked">[]>(),
      supabase
        .from("inventory_items")
        .select("id,name,quantity,min_quantity,unit,storage_location")
        .eq("household_id", household)
        .or(`name.ilike.${like},storage_location.ilike.${like},category.ilike.${like}`)
        .limit(20)
        .returns<Pick<InventoryItem, "id" | "name" | "quantity" | "min_quantity" | "unit" | "storage_location">[]>(),
    ]);

    hits = [
      ...(events.data ?? []).map((e) => ({
        key: `e-${e.id}`,
        title: e.title,
        where: e.kind === "appointment" ? "תור" : "יומן",
        detail: [
          relDay(zonedDate(e.starts_at, timeZone), today),
          e.location,
        ]
          .filter(Boolean)
          .join(" · "),
        href: "/calendar",
      })),
      ...(tasks.data ?? []).map((t) => ({
        key: `t-${t.id}`,
        title: t.title,
        where: "משימה",
        detail: [
          t.assignee_id ? memberById.get(t.assignee_id) : null,
          t.due_at ? relDay(zonedDate(t.due_at, timeZone), today) : null,
          t.status === "done" ? "הושלמה" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: "/tasks",
      })),
      ...(shopping.data ?? []).map((s) => ({
        key: `s-${s.id}`,
        title: s.name,
        where: "קניות",
        detail: `${s.quantity} ${s.unit ?? "יח׳"}${s.is_checked ? " · בעגלה" : ""}`,
        href: "/shopping",
      })),
      ...(inventory.data ?? []).map((i) => ({
        key: `i-${i.id}`,
        title: i.name,
        where: "מלאי",
        detail: [
          i.storage_location,
          `${i.quantity} ${i.unit}`,
          i.quantity <= i.min_quantity ? "חסר" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: "/inventory",
      })),
    ];
  }

  return (
    <>
      <SearchField initial={term} />

      {!searched ? (
        <p className="px-1 text-[0.82rem] leading-relaxed text-ink-faint">
          חיפוש אחד על היומן, התורים, המשימות, רשימת הקניות והמלאי.
          {term.length === 1 ? " צריך לפחות שתי אותיות." : ""}
        </p>
      ) : hits.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            {hits.length} תוצאות עבור «{term}»
          </h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {hits.map((h) => (
              <li key={h.key}>
                <Link href={h.href} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[0.93rem] font-semibold">
                      {h.title}
                    </span>
                    {h.detail ? (
                      <span className="truncate text-[0.78rem] text-ink-soft">
                        {h.detail}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-accent-pastel px-2 py-0.5 text-[0.66rem] font-bold text-accent">
                    {h.where}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-ink-faint shadow-[var(--shadow)]">
          לא נמצא כלום עבור «{term}»
        </div>
      )}
    </>
  );
}
