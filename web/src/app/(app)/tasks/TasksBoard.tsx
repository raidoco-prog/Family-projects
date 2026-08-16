"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import MemberAvatar from "@/components/MemberAvatar";
import Check from "@/components/Check";
import { applyChange, useRealtimeRows } from "@/lib/useRealtime";
import { isoDay, nowIn, relDay, startOfDay, timeStr, zonedDate } from "@/lib/calendar";
import type { Member, Task } from "@/lib/types";
import TaskForm from "./TaskForm";
import { deleteTask, setTaskStatus } from "./actions";

type Filter = "mine" | "all" | "done";

const PRIORITY_BAR: Record<number, string> = {
  1: "bg-danger",
  2: "bg-signal",
  3: "bg-transparent",
};

const PRIORITY_LABEL: Record<number, string> = {
  1: "דחוף",
  2: "רגיל",
  3: "כשאפשר",
};

/** Undated tasks sort last; among dated ones, soonest first. */
const byDue = (a: Task, b: Task) => {
  const av = a.due_at ? Date.parse(a.due_at) : Number.MAX_SAFE_INTEGER;
  const bv = b.due_at ? Date.parse(b.due_at) : Number.MAX_SAFE_INTEGER;
  return av - bv;
};

export default function TasksBoard({
  householdId,
  members,
  currentMemberId,
  initialTasks,
  timeZone,
}: {
  householdId: string;
  members: Member[];
  currentMemberId: string;
  initialTasks: Task[];
  timeZone: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState<Filter>("mine");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useRealtimeRows<Task>(
    "tasks",
    householdId,
    useCallback((change) => {
      setTasks((prev) => applyChange(prev, change, byDue));
    }, []),
  );

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  const today = startOfDay(nowIn(timeZone));
  const now = nowIn(timeZone);

  const visible = useMemo(() => {
    const list = tasks.filter((t) => {
      if (filter === "done") return t.status === "done";
      const open = t.status === "open" || t.status === "in_progress";
      return filter === "mine" ? open && t.assignee_id === currentMemberId : open;
    });
    return [...list].sort(byDue);
  }, [tasks, filter, currentMemberId]);

  const openCount = (memberId: string) =>
    tasks.filter(
      (t) => t.assignee_id === memberId && (t.status === "open" || t.status === "in_progress"),
    ).length;

  function toggle(task: Task) {
    const next = task.status === "done" ? "open" : "done";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    startTransition(async () => {
      const res = await setTaskStatus(task.id, next);
      if (res.error) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
        );
        setError(res.error);
      }
    });
  }

  function remove(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (res.error) {
        setTasks((prev) => [...prev, task].sort(byDue));
        setError(res.error);
      }
    });
  }

  return (
    <>
      <div className="flex gap-1.5">
        {(
          [
            ["mine", "שלי"],
            ["all", "של כולם"],
            ["done", "הושלמו"],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold ${
              filter === value
                ? "border-accent/30 bg-accent-pastel text-accent"
                : "border-rule bg-surface text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            {filter === "done" ? "הושלמו" : filter === "mine" ? "המשימות שלי" : "כל המשימות"}
          </h1>
          <span className="text-[0.74rem] text-ink-faint tabular-nums">
            {visible.length}
          </span>
        </div>

        {visible.length ? (
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {visible.map((task) => {
              const assignee = task.assignee_id ? memberById.get(task.assignee_id) : null;
              const due = task.due_at ? zonedDate(task.due_at, timeZone) : null;
              const late = due !== null && task.status !== "done" && due < now;
              const done = task.status === "done";

              return (
                <li key={task.id} className="flex items-stretch gap-2.5 px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className={`w-[3px] shrink-0 rounded-sm ${PRIORITY_BAR[task.priority]}`}
                  />
                  <Check
                    checked={done}
                    onToggle={() => toggle(task)}
                    label={`סמן ${task.title} כבוצעה`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col self-center">
                    <span
                      className={`truncate text-[0.93rem] font-semibold ${
                        done ? "text-ink-faint line-through" : ""
                      }`}
                    >
                      {task.title}
                    </span>
                    <span
                      className={`text-[0.78rem] ${
                        late ? "font-semibold text-danger" : "text-ink-soft"
                      }`}
                    >
                      {due
                        ? `${late ? "באיחור · " : ""}${relDay(due, today)} ${timeStr(due)}`
                        : "ללא תאריך יעד"}
                      {task.priority === 1 && !done ? ` · ${PRIORITY_LABEL[1]}` : ""}
                    </span>
                    {task.notes ? (
                      <span className="truncate text-[0.74rem] text-ink-faint">
                        {task.notes}
                      </span>
                    ) : null}
                  </div>
                  {assignee ? <MemberAvatar member={assignee} size="sm" /> : null}
                  <button
                    type="button"
                    onClick={() => remove(task)}
                    aria-label={`מחיקת ${task.title}`}
                    className="self-center px-1 text-lg leading-none text-ink-faint hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-ink-faint shadow-[var(--shadow)]">
            {filter === "done" ? "עדיין לא הושלמו משימות" : "אין משימות פתוחות"}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          חלוקה במשפחה
        </h2>
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
          {members.map((m) => {
            const n = openCount(m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <MemberAvatar member={m} size="sm" />
                <span className="flex-1 truncate text-[0.93rem] font-semibold">
                  {m.display_name}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.66rem] font-bold ${
                    n ? "bg-sunk text-ink-soft" : "bg-accent-pastel text-accent"
                  }`}
                >
                  {n ? `${n} פתוחות` : "הכול סגור"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {composing ? (
        <TaskForm
          members={members}
          currentMemberId={currentMemberId}
          defaultDate={isoDay(today)}
          onDone={() => setComposing(false)}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="h-11 rounded-xl border border-rule bg-surface text-sm font-bold text-accent"
        >
          משימה חדשה
        </button>
      )}
    </>
  );
}
