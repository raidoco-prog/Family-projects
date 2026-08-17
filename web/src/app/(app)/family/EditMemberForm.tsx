"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MEMBER_COLORS } from "@/lib/palette";
import { updateMember, type FamilyState } from "./actions";
import type { Member } from "@/lib/types";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 flex-1 rounded-xl bg-accent-pastel text-xs font-bold text-accent disabled:opacity-60"
    >
      {pending ? "רגע…" : "שמירה"}
    </button>
  );
}

export default function EditMemberForm({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FamilyState, FormData>(
    async (prev, fd) => {
      const result = await updateMember(prev, fd);
      if (!result.error) setOpen(false);
      return result;
    },
    {},
  );
  const [color, setColor] = useState(member.color);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-rule bg-surface px-2.5 py-1 text-[0.7rem] font-bold text-ink-soft"
      >
        עריכה
      </button>
    );
  }

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-2.5 rounded-xl bg-sunk p-3"
    >
      <input type="hidden" name="member_id" value={member.id} />

      <input
        name="name"
        required
        defaultValue={member.display_name}
        aria-label="שם"
        className="h-9 rounded-lg border border-rule bg-ground px-2.5 text-sm"
      />

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[0.7rem] text-ink-soft">תפקיד</span>
          <select
            name="role"
            defaultValue={member.role}
            className="h-9 rounded-lg border border-rule bg-ground px-2 text-sm"
          >
            <option value="child">ילד/ה</option>
            <option value="parent">הורה</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[0.7rem] text-ink-soft">תאריך לידה</span>
          {/* The bug this screen exists for: a phone's date wheel opens on
              today, so a date entered without spinning the year lands in the
              current one and the app shows an age of 0. A max of today at
              least refuses a birth date in the future. */}
          <input
            type="date"
            name="birth_date"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={member.birth_date ?? ""}
            className="h-9 rounded-lg border border-rule bg-ground px-2 text-sm"
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[0.7rem] text-ink-soft">צבע</legend>
        <input type="hidden" name="color" value={color} />
        <div className="flex flex-wrap gap-1.5">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              aria-label={c.name}
              aria-pressed={color === c.value}
              className={`h-7 w-7 rounded-full border-2 ${
                color === c.value ? "border-ink" : "border-transparent"
              }`}
              style={{ background: c.value }}
            />
          ))}
        </div>
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-xs font-semibold text-danger-ink">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Save />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 flex-1 rounded-xl border border-rule bg-surface text-xs font-bold text-ink-soft"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
