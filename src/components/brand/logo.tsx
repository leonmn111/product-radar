/** The ProductRadar mark: a purple radar sweep. Decorative; the name always sits beside it. */
export function Logo() {
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm shadow-purple-600/30">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5">
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 12 18 6" />
      </svg>
    </span>
  );
}
