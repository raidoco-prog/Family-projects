/**
 * Database types for the tables phase 0 touches.
 *
 * Once the project is live, replace this file with generated output:
 *   npx supabase gen types typescript --project-id <id> > src/lib/types.ts
 * Hand-written types drift from the schema; generated ones cannot.
 */

export type MemberRole = "parent" | "child" | "guest";

export interface Household {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
}

export interface Member {
  id: string;
  household_id: string;
  user_id: string | null;
  display_name: string;
  role: MemberRole;
  color: string;
  birth_date: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface HouseholdInvite {
  id: string;
  household_id: string;
  member_id: string | null;
  token: string;
  created_by: string | null;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
}

export type ShoppingSource = "manual" | "auto_low_stock";

export interface ShoppingItem {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  store: string | null;
  is_checked: boolean;
  source: ShoppingSource;
  inventory_item_id: string | null;
  added_by: string | null;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  household_id: string;
  name: string;
  category: string | null;
  storage_location: string | null;
  unit: string;
  quantity: number;
  min_quantity: number;
  target_quantity: number | null;
  auto_restock: boolean;
  barcode: string | null;
  expires_on: string | null;
  updated_at: string;
}

/** A member row joined with the household it belongs to. */
export interface Session {
  member: Member;
  household: Household;
  members: Member[];
}
