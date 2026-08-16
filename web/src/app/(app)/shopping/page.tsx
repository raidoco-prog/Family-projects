import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ShoppingItem } from "@/lib/types";
import ShoppingBoard from "./ShoppingBoard";

export default async function ShoppingPage() {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("household_id", session.household.id)
    .order("created_at", { ascending: false })
    .returns<ShoppingItem[]>();

  return (
    <ShoppingBoard
      householdId={session.household.id}
      members={session.members}
      initialItems={data ?? []}
    />
  );
}
