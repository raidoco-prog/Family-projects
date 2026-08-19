import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import MemberAvatar from "@/components/MemberAvatar";
import NotificationNudge from "@/components/NotificationNudge";
import {
  addDays,
  expandEvents,
  isoDay,
  nowIn,
  relDay,
  startOfDay,
  timeStr,
  zonedDate,
} from "@/lib/calendar";
import type {
  CalendarEvent,
  InventoryItem,
  ShoppingItem,
  Task,
} from "@/lib/types";

function greeting(hour: number) {
  if (hour < 11) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  if (hour < 21) return "ערב טוב";
  return "לילה טוב";
}

const KIND_LABEL: Record<string, string> = {
  appointment: "תור",
  birthday: "יום הולדת",
  holiday: "חג",
  school: "בית ספר",
};

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null;

  const { member, members, household } = session;
  const timeZone = household.timezone || "Asia/Jerusalem";
  // The server runs in UTC. Reading the hour off it would wish the family
  // good morning at lunchtime.
  const now = nowIn(timeZone);
  const today = startOfDay(now);
  const horizon = addDays(today, 2);
  const pending = members.filter((m) => !m.user_id);

  const supabase = await createClient();
  const [{ data: shopping }, { data: inventory }, { data: myTasks }, { data: events }, { data: dueTasks }] =
    await Promise.all([
      supabase
        .from("shopping_items")
        .select("id,is_checked")
        .eq("household_id", household.id)
        .eq("is_checked", false)
        .returns<Pick<ShoppingItem, "id" | "is_checked">[]>(),
      supabase
        .from("inventory_items")
        .select("id,name,quantity,min_quantity,unit,storage_location")
        .eq("household_id", household.id)
        .returns<
          Pick<
            InventoryItem,
            "id" | "name" | "quantity" | "min_quantity" | "unit" | "storage_location"
          >[]
        >(),
      supabase
        .from("tasks")
        .select("id,title,due_at,priority,status")
        .eq("household_id", household.id)
        .eq("assignee_id", member.id)
        .in("status", ["open", "in_progress"])
        .order("due_at", { nullsFirst: false })
        .returns<Pick<Task, "id" | "title" | "due_at" | "priority" | "status">[]>(),
      supabase
        .from("events")
        .select("*, event_participants(member_id), appointments(*)")
        .eq("household_id", household.id)
        // A recurring row starts once and repeats forward, so a lower bound on
        // starts_at would hide exactly the events that are due today.
        .or(`starts_at.gte.${addDays(new Date(), -1).toISOString()},rrule.not.is.null`)
        .returns<CalendarEvent[]>(),
      supabase
        .from("tasks")
        .select("id,title,due_at,priority,status,assignee_id")
        .eq("household_id", household.id)
        .not("due_at", "is", null)
        .in("status", ["open", "in_progress"])
        .returns<(Pick<Task, "id" | "title" | "due_at" | "priority" | "status"> & { assignee_id: string | null })[]>(),
    ]);

  const openShopping = shopping?.length ?? 0;
  const lowStock = (inventory ?? []).filter((i) => i.quantity <= i.min_quantity);

  // Today and tomorrow, events and deadlines together — that is the question
  // this screen exists to answer.
  const occurrences = expandEvents(events ?? [], today, horizon, timeZone);
  const agenda = [
    ...occurrences.map((o) => ({
      key: `e-${o.event.id}-${o.start.getTime()}`,
      at: o.start,
      title: o.event.title,
      note: KIND_LABEL[o.event.kind] ?? null,
      allDay: o.event.all_day || o.event.kind === "birthday" || o.event.kind === "holiday",
      task: false,
      href: "/calendar",
    })),
    ...(dueTasks ?? []).map((t) => ({
      key: `t-${t.id}`,
      at: zonedDate(t.due_at as string, timeZone),
      title: t.title,
      note: t.assignee_id === member.id ? "משימה שלי" : "משימה",
      allDay: false,
      task: true,
      href: "/tasks",
    })),
  ]
    .filter((i) => i.at >= today && i.at < horizon)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

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

      {/* Directly under the greeting: the first thing seen, and the only
          place a person reliably looks. It removes itself once there is
          nothing to ask. */}
      <NotificationNudge
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      />

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
        <Link
          href="/calendar"
          className="flex flex-col rounded-2xl border border-rule bg-surface p-3 shadow-[var(--shadow)]"
        >
          <b className="text-2xl font-bold leading-tight tabular-nums">
            {agenda.filter((i) => isoDay(i.at) === isoDay(today)).length}
          </b>
          <span className="text-[0.74rem] text-ink-soft">על היומן היום</span>
        </Link>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          היום ומחר
        </h2>
        {agenda.length ? (
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {agenda.slice(0, 6).map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className={`w-[3.4rem] shrink-0 text-[0.78rem] font-bold tabular-nums ${
                      isoDay(i.at) === isoDay(today) ? "text-accent" : "text-ink-faint"
                    }`}
                  >
                    {i.allDay ? relDay(i.at, today) : timeStr(i.at)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`h-6 w-[3px] shrink-0 rounded-sm ${
                      i.task ? "bg-transparent ring-1 ring-inset ring-rule" : "bg-accent-pastel"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.93rem] font-semibold">
                    {i.title}
                  </span>
                  {i.note ? (
                    <span className="shrink-0 rounded-full bg-accent-pastel px-2 py-0.5 text-[0.66rem] font-bold text-accent">
                      {i.note}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-ink-faint shadow-[var(--shadow)]">
            אין אירועים היום ומחר
          </div>
        )}
      </section>

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
    </>
  );
}
