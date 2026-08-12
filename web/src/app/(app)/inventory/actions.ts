"use server";

import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import type { ActionResult } from "../shopping/actions";

const EXPIRED = "פג תוקף החיבור. התחברו מחדש.";

/**
 * Sets an absolute quantity rather than applying a delta.
 *
 * The client already knows the number it is showing, and an absolute write
 * means two people tapping at once converge on a value instead of
 * double-counting. Crossing the minimum from here is what fires
 * sync_low_stock_to_shopping in the database.
 */
export async function setInventoryQuantity(
  id: string,
  quantity: number,
): Promise<ActionResult> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "כמות לא תקינה." };
  }

  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq("id", id);

  return error ? { error: "העדכון נכשל. נסו שוב." } : {};
}

export interface NewInventoryItem {
  name: string;
  unit: string;
  storage_location: string;
  category: string;
  quantity: number;
  min_quantity: number;
}

export async function addInventoryItem(
  item: NewInventoryItem,
): Promise<ActionResult> {
  const name = item.name.trim();
  if (!name) return { error: "צריך למלא שם מוצר." };
  if (item.min_quantity < 0 || item.quantity < 0) {
    return { error: "כמויות חייבות להיות אי-שליליות." };
  }

  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase.from("inventory_items").insert({
    household_id: session.household.id,
    name,
    unit: item.unit || "יח׳",
    storage_location: item.storage_location || "אחר",
    category: item.category || "אחר",
    quantity: item.quantity,
    min_quantity: item.min_quantity,
  });

  if (error) {
    // unique (household_id, name)
    return {
      error:
        error.code === "23505"
          ? "כבר קיים מוצר בשם הזה במלאי."
          : "ההוספה נכשלה. נסו שוב.",
    };
  }
  return {};
}

export async function setMinQuantity(
  id: string,
  minQuantity: number,
): Promise<ActionResult> {
  if (!Number.isFinite(minQuantity) || minQuantity < 0) {
    return { error: "סף לא תקין." };
  }

  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({ min_quantity: minQuantity })
    .eq("id", id);

  return error ? { error: "העדכון נכשל. נסו שוב." } : {};
}

export async function deleteInventoryItem(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: EXPIRED };

  const supabase = await createClient();
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);

  return error ? { error: "המחיקה נכשלה. נסו שוב." } : {};
}
