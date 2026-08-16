"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = { id: string };
type Change<T> =
  | { type: "INSERT"; row: T }
  | { type: "UPDATE"; row: T }
  | { type: "DELETE"; id: string }
  | { type: "RESET"; rows: T[] };

/**
 * Keeps a local list in sync with a table, for one household.
 *
 * This is not a nicety. Rows appear here that no client asked for: the
 * low-stock trigger inserts shopping items, and checking one off updates
 * inventory. Polling would make those feel broken, and re-fetching on every
 * change would fight the optimistic updates.
 */
export function useRealtimeRows<T extends Row>(
  table: "shopping_items" | "inventory_items" | "tasks",
  householdId: string,
  onChange: (change: Change<T>) => void,
) {
  // Kept in a ref so re-renders don't tear down and rebuild the channel.
  const handler = useRef(onChange);
  handler.current = onChange;
  // The first SUBSCRIBED is the initial connect, where the server already
  // sent the rows. Every later one is a reconnect, and needs a resync.
  const connected = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // Realtime does not replay what happened while the socket was down, so a
    // reconnect leaves the list silently wrong — and on a phone, dropping the
    // connection is the normal case, not the exception. Re-reading the table
    // on reconnect is what stops a stale list from looking like a correct one.
    const resync = async () => {
      const { data } = await supabase
        .from(table)
        .select("*")
        .eq("household_id", householdId);
      if (data) handler.current({ type: "RESET", rows: data as T[] });
    };

    const channel = supabase
      .channel(`${table}:${householdId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<Row>)?.id;
            if (id) handler.current({ type: "DELETE", id });
            return;
          }
          handler.current({
            type: payload.eventType as "INSERT" | "UPDATE",
            row: payload.new as T,
          });
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (connected.current) void resync();
        connected.current = true;
      });

    return () => {
      connected.current = false;
      void supabase.removeChannel(channel);
    };
  }, [table, householdId]);
}

/** Applies a realtime change to a list, keeping it sorted by `sort`. */
export function applyChange<T extends Row>(
  list: T[],
  change: Change<T>,
  sort?: (a: T, b: T) => number,
): T[] {
  let next: T[];

  if (change.type === "RESET") {
    next = change.rows;
  } else if (change.type === "DELETE") {
    next = list.filter((r) => r.id !== change.id);
  } else if (list.some((r) => r.id === change.row.id)) {
    next = list.map((r) => (r.id === change.row.id ? change.row : r));
  } else {
    next = [...list, change.row];
  }

  return sort ? [...next].sort(sort) : next;
}
