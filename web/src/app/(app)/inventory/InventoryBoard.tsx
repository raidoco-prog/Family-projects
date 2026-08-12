"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { applyChange, useRealtimeRows } from "@/lib/useRealtime";
import type { InventoryItem } from "@/lib/types";
import {
  addInventoryItem,
  deleteInventoryItem,
  setInventoryQuantity,
} from "./actions";

const byName = (a: InventoryItem, b: InventoryItem) =>
  a.name.localeCompare(b.name, "he");

const LOCATIONS = ["מקרר", "מקפיא", "מזווה", "אמבטיה", "מכבסה", "ארונית", "אחר"];

export default function InventoryBoard({
  householdId,
  initialItems,
}: {
  householdId: string;
  initialItems: InventoryItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  useRealtimeRows<InventoryItem>(
    "inventory_items",
    householdId,
    useCallback((change) => {
      setItems((prev) => applyChange(prev, change, byName));
    }, []),
  );

  const lowCount = items.filter((i) => i.quantity <= i.min_quantity).length;

  const byLocation = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>();
    for (const item of items) {
      const key = item.storage_location || "אחר";
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()];
  }, [items]);

  /**
   * Writes an absolute quantity, not a delta — two people tapping at once
   * then converge instead of double-counting. Crossing the minimum fires the
   * database trigger that opens a shopping item, which arrives back on the
   * shopping screen over realtime.
   */
  function adjust(item: InventoryItem, delta: number) {
    const next = Math.max(0, item.quantity + delta);
    if (next === item.quantity) return;

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, quantity: next } : i)),
    );
    setError(null);

    startTransition(async () => {
      const res = await setInventoryQuantity(item.id, next);
      if (res.error) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, quantity: item.quantity } : i,
          ),
        );
        setError(res.error);
      }
    });
  }

  function remove(item: InventoryItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    startTransition(async () => {
      const res = await deleteInventoryItem(item.id);
      if (res.error) {
        setItems((prev) => [...prev, item].sort(byName));
        setError(res.error);
      }
    });
  }

  async function handleAdd(formData: FormData) {
    const res = await addInventoryItem({
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") ?? "יח׳"),
      storage_location: String(formData.get("location") ?? "אחר"),
      category: String(formData.get("category") ?? "אחר"),
      quantity: Number(formData.get("quantity") ?? 0),
      min_quantity: Number(formData.get("min_quantity") ?? 1),
    });
    if (res.error) setError(res.error);
    else {
      setError(null);
      setAdding(false);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            מלאי הבית
          </h1>
          <span className="text-[0.74rem] text-ink-faint tabular-nums">
            {lowCount ? `${lowCount} מוצרים חסרים` : "הכול במלאי"}
          </span>
        </div>

        {error ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}

        {items.length ? (
          <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {byLocation.map(([location, list]) => (
              <div key={location}>
                <h2 className="bg-surface px-3.5 pb-1 pt-2.5 text-[0.68rem] font-bold uppercase tracking-[0.09em] text-ink-faint">
                  {location}
                </h2>
                <ul className="divide-y divide-rule border-t border-rule">
                  {list.map((item) => {
                    const low = item.quantity <= item.min_quantity;
                    const target = item.target_quantity ?? item.min_quantity * 2;
                    const pct = Math.max(
                      4,
                      Math.min(100, (item.quantity / Math.max(target, 1)) * 100),
                    );

                    return (
                      <li
                        key={item.id}
                        className={`flex items-center gap-3 px-3.5 py-2.5 ${
                          low ? "bg-signal-soft" : ""
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[0.93rem] font-semibold">
                              {item.name}
                            </span>
                            {low ? (
                              <span className="rounded-full bg-signal-pastel px-2 py-0.5 text-[0.66rem] font-bold text-signal">
                                חסר
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[0.78rem] text-ink-soft tabular-nums">
                            סף מינימום {item.min_quantity} {item.unit}
                          </span>
                          <div className="mt-1 h-[3px] overflow-hidden rounded-sm bg-sunk">
                            <div
                              className={`h-full rounded-sm ${
                                low ? "bg-signal" : "bg-accent"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => adjust(item, -1)}
                            disabled={item.quantity <= 0}
                            aria-label={`הפחתת ${item.name}`}
                            className="grid size-7 place-items-center rounded-lg border border-rule bg-surface text-ink-soft disabled:opacity-35"
                          >
                            −
                          </button>
                          <b className="min-w-[2.7rem] text-center text-[0.84rem] font-bold tabular-nums">
                            {item.quantity} {item.unit}
                          </b>
                          <button
                            type="button"
                            onClick={() => adjust(item, 1)}
                            aria-label={`הוספת ${item.name}`}
                            className="grid size-7 place-items-center rounded-lg border border-rule bg-surface text-ink-soft"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => remove(item)}
                          aria-label={`מחיקת ${item.name}`}
                          className="shrink-0 px-1 text-lg leading-none text-ink-faint hover:text-danger"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-ink-faint shadow-[var(--shadow)]">
            המלאי ריק. הוסיפו מוצר ראשון למטה.
          </div>
        )}
      </section>

      {adding ? (
        <form
          action={handleAdd}
          className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-3.5 shadow-[var(--shadow)]"
        >
          <input
            name="name"
            required
            autoFocus
            placeholder="שם המוצר"
            aria-label="שם המוצר"
            className="h-10 rounded-xl border border-rule bg-ground px-3 text-sm placeholder:text-ink-faint"
          />
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.74rem] text-ink-soft">כמות</span>
              <input
                type="number"
                name="quantity"
                min={0}
                step="any"
                defaultValue={1}
                className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm tabular-nums"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.74rem] text-ink-soft">סף מינימום</span>
              <input
                type="number"
                name="min_quantity"
                min={0}
                step="any"
                defaultValue={1}
                className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm tabular-nums"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.74rem] text-ink-soft">יחידה</span>
              <input
                name="unit"
                defaultValue="יח׳"
                className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.74rem] text-ink-soft">מיקום</span>
              <select
                name="location"
                defaultValue="מזווה"
                className="h-10 rounded-xl border border-rule bg-ground px-2 text-sm"
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            name="category"
            placeholder="קטגוריה (למשל: מוצרי חלב)"
            aria-label="קטגוריה"
            className="h-10 rounded-xl border border-rule bg-ground px-3 text-sm placeholder:text-ink-faint"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-10 flex-1 rounded-xl bg-accent-pastel text-sm font-bold text-accent"
            >
              הוספה למלאי
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-10 rounded-xl border border-rule px-4 text-sm font-semibold text-ink-soft"
            >
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-11 rounded-xl border border-rule bg-surface text-sm font-bold text-accent"
        >
          הוספת מוצר למלאי
        </button>
      )}

      <p className="text-center text-[0.74rem] leading-relaxed text-ink-faint">
        ירידה אל מתחת לסף המינימום פותחת פריט ברשימת הקניות באופן אוטומטי,
        <br />
        בכמות שתחזיר את המלאי ליעד ההשלמה.
      </p>
    </>
  );
}
