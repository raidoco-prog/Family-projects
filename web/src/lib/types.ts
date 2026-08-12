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

export type EventKind =
  | "general"
  | "appointment"
  | "birthday"
  | "holiday"
  | "school"
  | "reminder";

export type ReminderKind = "lead_24h" | "lead_1h" | "day_of_1030";

export interface Appointment {
  event_id: string;
  patient_id: string;
  doctor_name: string | null;
  specialty: string | null;
  clinic: string | null;
  hmo: string | null;
  phone: string | null;
  referral_needed: boolean;
  referral_number: string | null;
  prep_notes: string | null;
  follow_up_after: string | null;
}

export interface EventReminder {
  id: string;
  event_id: string;
  member_id: string;
  kind: ReminderKind;
  fire_at: string;
  sent_at: string | null;
}

export interface CalendarEvent {
  id: string;
  household_id: string;
  kind: EventKind;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  rrule: string | null;
  color: string | null;
  reminders_on: boolean;
  birthday_for: string | null;
  created_by: string | null;
  created_at: string;
  event_participants: { member_id: string }[];
  appointments: Appointment | Appointment[] | null;
  event_reminders: EventReminder[];
}

/** One dated instance of an event — a recurring event yields many. */
export interface Occurrence {
  event: CalendarEvent;
  /** Local start of this instance. */
  start: Date;
  /** True when produced by expanding an rrule rather than the base row. */
  repeated: boolean;
}

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

export interface Task {
  id: string;
  household_id: string;
  title: string;
  notes: string | null;
  assignee_id: string | null;
  created_by: string | null;
  due_at: string | null;
  /** 1 = highest, 3 = lowest. */
  priority: number;
  status: TaskStatus;
  rrule: string | null;
  points: number;
  completed_at: string | null;
  completed_by: string | null;
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
