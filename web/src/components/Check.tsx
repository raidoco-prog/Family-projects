export default function Check({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`grid size-[21px] shrink-0 place-items-center rounded-[7px] border-[1.7px] transition ${
        checked ? "border-accent bg-accent" : "border-ink-faint"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`size-[13px] fill-none stroke-surface stroke-[2.6] ${
          checked ? "opacity-100" : "opacity-0"
        }`}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  );
}
