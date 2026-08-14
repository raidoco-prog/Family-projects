"use client";

import { useEffect, useState } from "react";
import type { ShoppingItem } from "@/lib/types";

/* ============================================================
   Offline support for the shopping list (N6).

   Scoped to this one screen on purpose. The supermarket is where the
   reception is bad and where being unable to add "חלב" sends the family
   back to the note on the fridge — S1's failure mode. Nothing else in the
   app has that property, and making everything work offline would mean
   reconciling conflicts nobody asked for.

   Two pieces of state live in localStorage:

   - a **snapshot** of what the screen should show, written on every change,
     so a cold open with no reception renders the real list rather than
     whatever HTML the service worker happened to cache;
   - a **queue** of the changes made while offline, replayed in order once
     the connection returns.
   ============================================================ */

const SNAPSHOT = (household: string) => `shopping:snapshot:${household}`;
const QUEUE = (household: string) => `shopping:queue:${household}`;

export type PendingOp =
  | { op: "add"; tempId: string; name: string }
  | { op: "check"; id: string; checked: boolean }
  | { op: "delete"; id: string }
  | { op: "clear" };

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // A full or disabled localStorage must not break the screen.
    return null;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* out of quota — the list still works, it just will not survive a reload */
  }
}

export function readSnapshot(household: string): ShoppingItem[] | null {
  return read<ShoppingItem[]>(SNAPSHOT(household));
}

export function writeSnapshot(household: string, items: ShoppingItem[]) {
  write(SNAPSHOT(household), items);
}

export function readQueue(household: string): PendingOp[] {
  return read<PendingOp[]>(QUEUE(household)) ?? [];
}

export function enqueue(household: string, op: PendingOp) {
  write(QUEUE(household), [...readQueue(household), op]);
}

export function writeQueue(household: string, ops: PendingOp[]) {
  write(QUEUE(household), ops);
}

/**
 * Replays the queue against the server, oldest first.
 *
 * Each op is dropped from the stored queue only once it has actually
 * succeeded, so a flush that dies halfway — the reception came back for two
 * seconds in the car park — resumes rather than losing the rest.
 *
 * An item added offline has a temporary id, and anything queued after it
 * refers to that id. `handlers.add` returns the real id, which is what the
 * later ops are rewritten to use.
 */
export async function flushQueue(
  household: string,
  handlers: {
    add: (name: string) => Promise<{ id?: string; error?: string }>;
    check: (id: string, checked: boolean) => Promise<{ error?: string }>;
    remove: (id: string) => Promise<{ error?: string }>;
    clear: () => Promise<{ error?: string }>;
  },
): Promise<{ done: number; failed: string | null }> {
  let queue = readQueue(household);
  const realId = new Map<string, string>();
  const resolve = (id: string) => realId.get(id) ?? id;
  let done = 0;

  while (queue.length) {
    const op = queue[0];
    let error: string | undefined;

    if (op.op === "add") {
      const res = await handlers.add(op.name);
      error = res.error;
      if (!error && res.id) realId.set(op.tempId, res.id);
    } else if (op.op === "check") {
      error = (await handlers.check(resolve(op.id), op.checked)).error;
    } else if (op.op === "delete") {
      error = (await handlers.remove(resolve(op.id))).error;
    } else {
      error = (await handlers.clear()).error;
    }

    if (error) return { done, failed: error };

    queue = queue.slice(1);
    writeQueue(household, queue);
    done++;
  }

  return { done, failed: null };
}

/**
 * Whether the browser thinks it has a connection.
 *
 * Starts as `true` rather than reading navigator.onLine, because the server
 * render has no navigator and a mismatch on the first paint is a hydration
 * error. The real value lands in the effect immediately afterwards.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
