/**
 * Stand-in for a module that later phases fill in. It states which phase
 * owns the screen, so an empty tab reads as planned rather than broken.
 */
export default function Placeholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-[0.74rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
          {title}
        </h1>
        <span className="rounded-full bg-sunk px-2 py-0.5 text-[0.66rem] font-bold text-ink-soft">
          {phase}
        </span>
      </div>
      <div className="rounded-2xl border border-rule bg-surface p-6 text-center shadow-[var(--shadow)]">
        <p className="text-sm text-ink-soft">{children}</p>
      </div>
    </section>
  );
}
