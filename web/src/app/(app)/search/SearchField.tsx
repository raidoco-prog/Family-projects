"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The search box.
 *
 * Typing updates the URL rather than local state, so a result can be shared,
 * bookmarked, and — the one that matters here — survives the back button
 * after tapping through to the item that was found.
 */
export default function SearchField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const router = useRouter();
  const first = useRef(true);

  useEffect(() => {
    // Do not re-navigate to the URL that rendered this.
    if (first.current) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    }, 250);
    return () => window.clearTimeout(id);
  }, [value, router]);

  return (
    <form
      role="search"
      onSubmit={(e) => e.preventDefault()}
      className="flex shrink-0 gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="search"
        autoFocus
        placeholder="חיפוש בכל האפליקציה"
        aria-label="חיפוש"
        enterKeyHint="search"
        className="h-11 min-w-0 flex-1 rounded-xl border border-rule bg-surface px-3 text-sm placeholder:text-ink-faint"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          className="rounded-xl border border-rule bg-surface px-4 text-sm font-semibold text-ink-soft"
        >
          ניקוי
        </button>
      ) : null}
    </form>
  );
}
