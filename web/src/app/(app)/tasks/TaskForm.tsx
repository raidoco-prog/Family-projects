"use client";

import { useState, useTransition } from "react";
import MemberAvatar from "@/components/MemberAvatar";
import type { Member } from "@/lib/types";
import { createTask, type NewTaskInput } from "./actions";

const PRIORITIES: { value: number; label: string; dot: string }[] = [
  { value: 1, label: "דחוף", dot: "bg-danger" },
  { value: 2, label: "רגיל", dot: "bg-signal" },
  { value: 3, label: "כשאפשר", dot: "bg-rule" },
];

const REPEATS: { value: NewTaskInput["repeat"]; label: string }[] = [
  { value: "none", label: "לא חוזרת" },
  { value: "daily", label: "כל יום" },
  { value: "weekly", label: "כל שבוע" },
  { value: "monthly", label: "כל חודש" },
  { value: "yearly", label: "כל שנה" },
];

const field =
  "h-10 rounded-xl border border-rule bg-ground px-3 text-sm placeholder:text-ink-faint";

export default function TaskForm({
  members,
  currentMemberId,
  defaultDate,
  onDone,
  onCancel,
}: {
  members: Member[];
  currentMemberId: string;
  defaultDate: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(currentMemberId);
  const [priority, setPriority] = useState(2);
  const [withDeadline, setWithDeadline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const input: NewTaskInput = {
      title: String(formData.get("title") ?? ""),
      assigneeId,
      date: withDeadline ? String(formData.get("date") ?? "") : "",
      time: withDeadline ? String(formData.get("time") ?? "") : "",
      priority,
      notes: String(formData.get("notes") ?? ""),
      repeat: withDeadline
        ? (String(formData.get("repeat") ?? "none") as NewTaskInput["repeat"])
        : "none",
    };
    startTransition(async () => {
      const res = await createTask(input);
      if (res.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]"
    >
      <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
        משימה חדשה
      </h2>

      <input
        name="title"
        required
        autoFocus
        placeholder="מה צריך לעשות?"
        aria-label="כותרת המשימה"
        className={field}
      />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[0.74rem] text-ink-soft">אחראי על הביצוע</legend>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = assigneeId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setAssigneeId(m.id)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.78rem] font-semibold ${
                  on ? "border-accent/30 bg-accent-pastel text-accent" : "border-rule text-ink-soft"
                }`}
              >
                <MemberAvatar member={m} size="xs" />
                {m.display_name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[0.74rem] text-ink-soft">עדיפות</legend>
        <div className="flex gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              aria-pressed={priority === p.value}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-[0.78rem] font-semibold ${
                priority === p.value
                  ? "border-accent/30 bg-accent-pastel text-accent"
                  : "border-rule text-ink-soft"
              }`}
            >
              <span className={`size-2 rounded-full ${p.dot}`} aria-hidden="true" />
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={withDeadline}
          onChange={(e) => setWithDeadline(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        תאריך יעד
      </label>

      {withDeadline ? (
        <>
          <div className="flex gap-2">
            <input type="date" name="date" defaultValue={defaultDate} aria-label="תאריך יעד" className={`${field} flex-1`} />
            <input type="time" name="time" defaultValue="20:00" aria-label="שעת יעד" className={`${field} flex-1`} />
          </div>
          {/* T8. Only offered alongside a deadline: a repeat needs something
              to repeat from. */}
          <label className="flex flex-col gap-1">
            <span className="text-[0.74rem] text-ink-soft">חזרתיות</span>
            <select name="repeat" defaultValue="none" aria-label="חזרתיות" className={field}>
              {REPEATS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <span className="text-[0.72rem] leading-relaxed text-ink-faint">
              כשמסמנים «בוצע», נוצר המופע הבא. המופע שהושלם נשמר עם מי שביצע
              אותו בפועל.
            </span>
          </label>
        </>
      ) : null}

      <input name="notes" placeholder="הערה (לא חובה)" aria-label="הערה" className={field} />

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 flex-1 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
        >
          {pending ? "רגע…" : "שמירה"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-xl border border-rule px-4 text-sm font-semibold text-ink-soft"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
