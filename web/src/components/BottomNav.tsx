"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/home",
    label: "בית",
    path: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  },
  {
    href: "/calendar",
    label: "יומן",
    path: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  },
  {
    href: "/tasks",
    label: "משימות",
    path: <><path d="M9 11l2 2 4-4" /><rect x="3" y="4" width="18" height="17" rx="2" /></>,
  },
  {
    href: "/shopping",
    label: "קניות",
    path: <><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 2H2" /></>,
  },
  {
    href: "/inventory",
    label: "מלאי",
    path: <><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ניווט ראשי"
      className="grid shrink-0 grid-cols-5 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-col items-center gap-0.5 px-1 pb-2.5 pt-2 text-[0.66rem] font-semibold ${
              active ? "text-accent" : "text-ink-faint"
            }`}
          >
            {active ? (
              <span className="absolute inset-x-[28%] top-0 h-0.5 rounded-b-sm bg-accent" />
            ) : null}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-[21px] fill-none stroke-current stroke-[1.6]"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {tab.path}
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
