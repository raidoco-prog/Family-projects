import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * N5 — the household's data, as one JSON file.
 *
 * Deliberately the user's own session and not the service-role client: RLS
 * then guarantees the file can only ever contain this household. A backup
 * route that bypassed policies would be one bug away from handing someone
 * another family's calendar.
 *
 * Supabase's free tier keeps backups for a limited window, so "the data is
 * in Postgres" is not a backup story on its own. This is the copy the
 * family actually holds.
 */
const TABLES = [
  "households",
  "members",
  "events",
  "event_participants",
  "appointments",
  "tasks",
  "shopping_items",
  "inventory_items",
  "notification_preferences",
] as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { data: rows, error } = await supabase.from(table).select("*");
    if (error) {
      return NextResponse.json(
        { error: `failed reading ${table}`, detail: error.message },
        { status: 500 },
      );
    }
    data[table] = rows ?? [];
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      household: session.household.name,
      // Bump when a column change would make an older file misread.
      format: 1,
      data,
    },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="family-backup-${stamp}.json"`,
      // A backup is a point in time; a cached one is a lie.
      "cache-control": "no-store",
    },
  });
}
