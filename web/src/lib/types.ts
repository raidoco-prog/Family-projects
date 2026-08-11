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

/** A member row joined with the household it belongs to. */
export interface Session {
  member: Member;
  household: Household;
  members: Member[];
}
