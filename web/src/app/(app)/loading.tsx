/**
 * Shown the instant a tab is tapped, until the page comes back.
 *
 * Without this file the App Router blocks: the previous screen stays put,
 * unchanged, until the server responds. In a browser tab that is survivable
 * because Safari draws its own progress indicator. Installed to the home
 * screen there is no browser chrome at all, so a navigation looked exactly
 * like a tap that did nothing — which is why the app felt far slower than
 * the same pages in the browser.
 *
 * It sits in the (app) group, so the bar and the navigation stay on screen
 * and only the content area is replaced. The shapes are deliberately
 * generic: this stands in for five different screens, and a skeleton that
 * mimics one of them in particular would be wrong on the other four.
 */
function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-sunk ${className}`} />;
}

export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      // `deferred` keeps this invisible for the first fraction of a second.
      // Most navigations now finish inside that window and show nothing,
      // which is the point: a skeleton that flashes is worse than none.
      className="deferred flex flex-col gap-4"
    >
      <span className="sr-only">טוען…</span>

      <Block className="h-5 w-32" />

      <div className="flex flex-col gap-2.5 rounded-2xl border border-rule bg-surface p-3.5">
        <Block className="h-4 w-2/3" />
        <Block className="h-4 w-1/2" />
        <Block className="h-4 w-3/5" />
      </div>

      <Block className="h-5 w-24" />

      <div className="flex flex-col gap-2.5 rounded-2xl border border-rule bg-surface p-3.5">
        <Block className="h-4 w-3/4" />
        <Block className="h-4 w-2/5" />
      </div>
    </div>
  );
}
