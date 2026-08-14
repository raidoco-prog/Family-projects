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

      <div className="flex shrink-0 items-center gap-2">
        <Link href="/family" aria-label="בני המשפחה" className="flex gap-1">
          {members.map((m) => (
            <MemberAvatar key={m.id} member={m} size="md" dim={m.id !== member.id} />
          ))}
        </Link>
        <Link
          href="/search"
          aria-label="חיפוש"
          className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-sunk"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-[18px] fill-none stroke-current stroke-[1.7]"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </Link>
        <Link
          href="/settings"
          aria-label="הגדרות התראות"
          className="grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-sunk"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-[18px] fill-none stroke-current stroke-[1.7]"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
