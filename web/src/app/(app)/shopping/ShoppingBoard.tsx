"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import MemberAvatar from "@/components/MemberAvatar";
import Check from "@/components/Check";
import { applyChange, useRealtimeRows } from "@/lib/useRealtime";
import {
  enqueue,
  flushQueue,
  readQueue,
  readSnapshot,
  useOnline,
  writeSnapshot,
} from "@/lib/offline";
import type { Member, ShoppingItem } from "@/lib/types";
import {
  addShoppingItem,
  clearCheckedItems,
  deleteShoppingItem,
  setShoppingChecked,
} from "./actions";

const newestFirst = (a: ShoppingItem, b: ShoppingItem) =>
  b.created_at.localeCompare(a.created_at);

export default function ShoppingBoard({
  householdId,
  members,
  initialItems,
}: {
  householdId: string;
  members: Member[];
  initialItems: ShoppingItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const online = useOnline();
  const [queued, setQueued] = useState(0);

  // Rows arrive here that nobody on this device asked for: the low-stock
  // trigger inserts them, and another phone in the supermarket checks them off.
  useRealtimeRows<ShoppingItem>(
    "shopping_items",
    householdId,
    useCallback((change) => {
      setItems((prev) => applyChange(prev, change, newestFirst));
    }, []),
  );

  /* ---- offline (N6) ---------------------------------------------- */

  // A cold open with no reception renders whatever HTML the service worker
  // cached, which may be days old. The snapshot is from the last time the
  // screen was actually looked at, so offline it wins.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    setQueued(readQueue(householdId).length);
    if (window.navigator.onLine) return;
    const snapshot = readSnapshot(householdId);
    if (snapshot?.length) setItems(snapshot);
  }, [householdId]);

  // Written on every change, so what survives a reload is what the user last
  // saw — including the items they added with no reception.
  useEffect(() => {
    writeSnapshot(householdId, items);
  }, [householdId, items]);

  // Back in range: replay what was done offline, in order.
  useEffect(() => {
    if (!online || readQueue(householdId).length === 0) return;
    let cancelled = false;

    void (async () => {
      const res = await flushQueue(householdId, {
        add: addShoppingItem,
        check: setShoppingChecked,
        remove: deleteShoppingItem,
        clear: clearCheckedItems,
      });
      if (cancelled) return;
      setQueued(readQueue(householdId).length);
      if (res.failed) setError(res.failed);
    })();

    return () => {
      cancelled = true;
    };
  }, [online, householdId]);

  /**
   * Runs a change against the server, or records it for later.
   *
   * Offline the server action is not attempted at all — it would hang on a
   * fetch that cannot succeed and leave the row looking unsaved. The optimistic
   * update has already happened either way, so the screen looks the same;
   * `rollback` only runs when the server was reachable and said no.
   */
  const commit = useCallback(
    (
      op: Parameters<typeof enqueue>[1],
      run: () => Promise<{ error?: string }>,
      rollback: () => void,
    ) => {
      if (!window.navigator.onLine) {
        enqueue(householdId, op);
        setQueued((n) => n + 1);
        return;
      }
      startTransition(async () => {
        const res = await run();
        if (res.error) {
          rollback();
          setError(res.error);
        }
      });
    },
    [householdId],
  );

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  const open = items.filter((i) => !i.is_checked);
  const done = items.filter((i) => i.is_checked);

  const byCategory = useMemo(() => {
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of open) {
      const key = item.category || "אחר";
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()];
  }, [open]);

  function submit() {
    const name = draft.trim();
    if (!name) return;

    // Optimistic: the whole point of this screen is that adding milk is
    // instant. Realtime replaces this row with the real one moments later.
    const temp: ShoppingItem = {
      id: `temp-${crypto.randomUUID()}`,
      household_id: householdId,
      name,
      quantity: 1,
      unit: "יח׳",
      category: "אחר",
      store: null,
      is_checked: false,
      source: "manual",
      inventory_item_id: null,
      added_by: null,
      checked_by: null,
      checked_at: null,
      created_at: new Date().toISOString(),
    };
    setItems((prev) => [temp, ...prev]);
    setDraft("");
    setError(null);

    if (!window.navigator.onLine) {
      enqueue(householdId, { op: "add", tempId: temp.id, name });
      setQueued((n) => n + 1);
      return;
    }

    startTransition(async () => {
      const res = await addShoppingItem(name);
      if (res.error || !res.id) {
        setItems((prev) => prev.filter((i) => i.id !== temp.id));
        setError(res.error ?? "ההוספה נכשלה. נסו שוב.");
        return;
      }
      // Adopt the real id. Without this the realtime INSERT that follows
      // carries a different id, finds no match, and the item appears twice.
      setItems((prev) =>
        prev.map((i) => (i.id === temp.id ? { ...i, id: res.id! } : i)),
      );
    });
  }

  function toggle(item: ShoppingItem) {
    const next = !item.is_checked;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_checked: next } : i)),
    );
    setError(null);
    commit(
      { op: "check", id: item.id, checked: next },
      () => setShoppingChecked(item.id, next),
      () =>
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, is_checked: item.is_checked } : i,
          ),
        ),
    );
  }

  function remove(item: ShoppingItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setError(null);
    commit(
      { op: "delete", id: item.id },
      () => deleteShoppingItem(item.id),
      () => setItems((prev) => [item, ...prev].sort(newestFirst)),
    );
  }

  function clearTrolley() {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => !i.is_checked));
    setError(null);
    commit({ op: "clear" }, clearCheckedItems, () => setItems(snapshot));
  }

  function Row({ item }: { item: ShoppingItem }) {
    const by = item.added_by ? memberById.get(item.added_by) : null;
    const auto = item.source === "auto_low_stock";

    return (
      <li className="flex items-center gap-3 px-3.5 py-2.5">
        <Check
          checked={item.is_checked}
          onToggle={() => toggle(item)}
          label={`סמן ${item.name} כנקנה`}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className={`truncate text-[0.93rem] font-semibold ${
              item.is_checked ? "text-ink-faint line-through" : ""
            }`}
          >
            {item.name}
          </span>
          <span className="text-[0.78rem] text-ink-soft tabular-nums">
            {item.quantity} {item.unit ?? "יח׳"}
          </span>
        </div>

        {auto ? (
          <span className="rounded-full bg-signal-pastel px-2 py-0.5 text-[0.66rem] font-bold text-signal">
            אוטומטי · מלאי
          </span>
        ) : by ? (
          <MemberAvatar member={by} size="xs" />
        ) : null}

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
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="מה חסר? למשל: במבה"
          aria-label="פריט חדש"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 rounded-xl border border-rule bg-surface px-3 text-sm placeholder:text-ink-faint"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent-pastel px-5 text-sm font-bold text-accent"
        >
          הוספה
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {/* A list that silently stops saving is worse than one that says so. */}
      {!online || queued > 0 ? (
        <p
          role="status"
          className="rounded-xl border border-signal/35 bg-signal-soft px-3 py-2 text-[0.8rem] font-semibold text-signal"
        >
          {online
            ? `מסנכרן ${queued} שינויים שנעשו ללא קליטה…`
            : queued > 0
              ? `אין קליטה. ${queued} שינויים ישמרו וישלחו כשהחיבור יחזור.`
              : "אין קליטה. הרשימה זמינה, והשינויים ישלחו כשהחיבור יחזור."}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
            לקנות
          </h1>
          <span className="text-[0.74rem] text-ink-faint tabular-nums">
            {open.length} פריטים
          </span>
        </div>

        {open.length ? (
          <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {byCategory.map(([category, list]) => (
              <div key={category}>
                <h2 className="bg-surface px-3.5 pb-1 pt-2.5 text-[0.68rem] font-bold uppercase tracking-[0.09em] text-ink-faint">
                  {category}
                </h2>
                <ul className="divide-y divide-rule border-t border-rule">
                  {list.map((item) => (
                    <Row key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-ink-faint shadow-[var(--shadow)]">
            הרשימה ריקה
          </div>
        )}
      </section>

      {done.length ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
              בעגלה
            </h2>
            <button
              type="button"
              onClick={clearTrolley}
              className="rounded-full border border-rule bg-surface px-3 py-1 text-[0.78rem] font-semibold text-ink-soft"
            >
              ניקוי
            </button>
          </div>
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
            {done.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-center text-[0.74rem] leading-relaxed text-ink-faint">
        פריטים עם התווית «אוטומטי» נוצרו על ידי כלל המלאי, לא הוזנו ביד.
        <br />
        סימון «נקנה» מחזיר את הכמות למלאי.
      </p>
    </>
  );
}
