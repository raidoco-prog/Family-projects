"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export interface ActionResult {
  error?: string;
}

/**
 * The id is returned because an item added offline carries a temporary one,
 * and everything queued behind it — checking it off, deleting it — refers to
 * that temporary id. The replay needs the real id to rewrite them.
 */
export interface AddResult extends ActionResult {
  id?: string;
}

const EXPIRED = "פג תוקף החיבור. התחברו מחדש.";

export async function addShoppingItem(name: string): Promise<AddResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "צריך למלא שם פריט." };

  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_items")
    .insert({
      household_id: session.household.id,
      name: trimmed,
      quantity: 1,
      unit: "יח׳",
      category: "אחר",
      source: "manual",
      added_by: session.member.id,
    })
    .select("id")
    .single<{ id: string }>();

  return error ? { error: "ההוספה נכשלה. נסו שוב." } : { id: data?.id };
}

/**
 * Checking an item off is what fires restock_inventory_on_check in the
 * database, so the inventory update is not this function's job.
 */
export async function setShoppingChecked(
  id: string,
  checked: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shopping_items")
    .update({
      is_checked: checked,
      checked_by: checked ? session.member.id : null,
      checked_at: checked ? new Date().toISOString() : null,
    })
    .eq("id", id);

  return error ? { error: "העדכון נכשל. נסו שוב." } : {};
}

export async function setShoppingQuantity(
  id: string,
  quantity: number,
): Promise<ActionResult> {
  if (!Number.isFinite(quantity) || quantity < 1) {
    return { error: "כמות לא תקינה." };
  }

  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shopping_items")
    .update({ quantity })
    .eq("id", id);

  return error ? { error: "העדכון נכשל. נסו שוב." } : {};
}

export async function deleteShoppingItem(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase.from("shopping_items").delete().eq("id", id);

  return error ? { error: "המחיקה נכשלה. נסו שוב." } : {};
}

/** Clears the checked items, i.e. empties the trolley after a shop. */
export async function clearCheckedItems(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shopping_items")
    .delete()
    .eq("household_id", session.household.id)
    .eq("is_checked", true);

  return error ? { error: "הניקוי נכשל. נסו שוב." } : {};
}
