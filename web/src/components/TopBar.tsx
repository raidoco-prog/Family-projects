import Link from "next/link";
import MemberAvatar from "./MemberAvatar";
import type { Session } from "@/lib/types";

export default function TopBar({ session }: { session: Session }) {
  const { household, member, members } = session;

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule bg-surface px-4 pb-2.5 pt-3">
      <div className="flex min-w-0 flex-col leading-tight">
        <b className="font-serif text-[1.05rem] font-semibold">{household.name}</b>
        <span className="truncate text-[0.72rem] text-ink-faint">
          מחוברים כ{member.display_name}
        </span>
      </div>

      <Link
        href="/family"
        aria-label="בני המשפחה"
        className="flex shrink-0 gap-1"
      >
        {members.map((m) => (
          <MemberAvatar
            key={m.id}
            member={m}
            size="md"
            dim={m.id !== member.id}
          />
        ))}
      </Link>
    </header>
  );
}
