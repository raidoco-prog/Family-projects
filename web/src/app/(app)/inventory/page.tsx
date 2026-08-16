import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";
import InventoryBoard from "./InventoryBoard";

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("household_id", session.household.id)
    .order("name")
    .returns<InventoryItem[]>();

  return (
    <InventoryBoard
      householdId={session.household.id}
      initialItems={data ?? []}
    />
  );
}
