"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MEMBER_COLORS, DEFAULT_COLOR, initial } from "@/lib/palette";
import { addMember, type FamilyState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
    >
      {pending ? "רגע…" : "הוספה"}
    </button>
  );
}

export default function AddMemberForm() {
  const [state, action] = useActionState<FamilyState, FormData>(addMember, {});
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [name, setName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
        הוספת בן משפחה
      </h2>

      <form
        ref={formRef}
        action={async (fd) => {
          await action(fd);
          formRef.current?.reset();
          setName("");
        }}
        className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]"
      >
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם"
          aria-label="שם בן המשפחה"
          className="h-10 rounded-xl border border-rule bg-ground px-3 text-sm placeholder:text-ink-faint"
        />

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[0.74rem] text-ink-soft">תפקיד</span>
            <select
              name="role"
              defaultValue="child"
              className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm"
            >
              <option value="child">ילד/ה</option>
              <option value="parent">הורה</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[0.74rem] text-ink-soft">תאריך לידה</span>
            <input
              type="date"
              name="birth_date"
              className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm"
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[0.74rem] text-ink-soft">צבע</legend>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap gap-1.5">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                aria-label={c.name}
                aria-pressed={color === c.value}
                style={{ background: c.value }}
                className={`grid size-8 place-items-center rounded-full text-[0.7rem] font-bold text-on-pastel transition ${
                  color === c.value
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                    : "opacity-70"
                }`}
              >
                {name ? initial(name) : ""}
              </button>
            ))}
          </div>
        </fieldset>

        {state.error ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        ) : null}

        <Submit />
      </form>
    </section>
  );
}
