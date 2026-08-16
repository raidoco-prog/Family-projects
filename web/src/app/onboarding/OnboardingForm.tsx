"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MEMBER_COLORS, DEFAULT_COLOR, initial } from "@/lib/palette";
import { createHousehold, type OnboardingState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-xl bg-accent-pastel text-sm font-bold text-accent disabled:opacity-60"
    >
      {pending ? "רגע…" : "יצירת משק הבית"}
    </button>
  );
}

export default function OnboardingForm() {
  const [state, action] = useActionState<OnboardingState, FormData>(
    createHousehold,
    {},
  );
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [name, setName] = useState("");

  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">שם משק הבית</span>
        <input
          name="household"
          required
          defaultValue="הבית שלנו"
          className="h-11 rounded-xl border border-rule bg-surface px-3 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">השם שלך</span>
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="איך שיקראו לך באפליקציה"
          className="h-11 rounded-xl border border-rule bg-surface px-3 text-sm placeholder:text-ink-faint"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">
          תאריך לידה{" "}
          <span className="font-normal text-ink-faint">(לימי הולדת ביומן)</span>
        </span>
        <input
          type="date"
          name="birth_date"
          className="h-11 rounded-xl border border-rule bg-surface px-3 text-sm"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1 text-sm font-semibold">הצבע שלך</legend>
        <input type="hidden" name="color" value={color} />
        <div className="flex flex-wrap gap-2">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              aria-label={c.name}
              aria-pressed={color === c.value}
              style={{ background: c.value }}
              className={`grid size-10 place-items-center rounded-full text-sm font-bold text-on-pastel transition ${
                color === c.value
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-ground"
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
  );
}
