import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import MemberAvatar from "@/components/MemberAvatar";
import AddMemberForm from "./AddMemberForm";
import InviteButton from "./InviteButton";
import EditMemberForm from "./EditMemberForm";
import type { HouseholdInvite } from "@/lib/types";

function age(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

export default async function FamilyPage() {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const { data: invites } = await supabase
    .from("household_invites")
    .select("*")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .returns<HouseholdInvite[]>();

  const openInvite = (memberId: string) =>
    invites?.find((i) => i.member_id === memberId);

  const isParent = session.member.role === "parent";

  return (
    <>
      <section className="flex flex-col gap-2">
        <h1 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          בני המשפחה
        </h1>
        <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface shadow-[var(--shadow)]">
          {session.members.map((m) => {
            const years = age(m.birth_date);
            const invite = openInvite(m.id);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                <MemberAvatar member={m} size="md" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[0.93rem] font-semibold">
                    {m.display_name}
                    {m.id === session.member.id ? (
                      <span className="text-ink-faint"> · את/ה</span>
                    ) : null}
                  </span>
                  <span className="text-[0.78rem] text-ink-soft">
                    {m.role === "parent" ? "הורה" : "ילד/ה"}
                    {years !== null ? ` · גיל ${years}` : ""}
                  </span>
                </div>

                {m.user_id ? (
                  <span className="rounded-full bg-accent-pastel px-2 py-0.5 text-[0.66rem] font-bold text-accent">
                    מחובר
                  </span>
                ) : isParent ? (
                  <InviteButton
                    memberId={m.id}
                    memberName={m.display_name}
                    existingToken={invite?.token}
                  />
                ) : (
                  <span className="rounded-full bg-sunk px-2 py-0.5 text-[0.66rem] font-bold text-ink-soft">
                    ללא חשבון
                  </span>
                )}

                {isParent ? <EditMemberForm member={m} /> : null}
              </li>
            );
          })}
        </ul>
        <p className="text-[0.76rem] leading-relaxed text-ink-faint">
          בן משפחה יכול להתקיים במערכת בלי חשבון משלו — כך אפשר לנהל תור רפואי
          של ילד קטן בלי לפתוח לו חשבון גוגל.
        </p>
      </section>

      {isParent ? <AddMemberForm /> : null}

      <form action="/auth/signout" method="post" className="pt-2">
        <button
          type="submit"
          className="w-full rounded-xl border border-rule bg-surface py-2.5 text-sm font-semibold text-ink-soft"
        >
          התנתקות
        </button>
      </form>
    </>
  );
}
