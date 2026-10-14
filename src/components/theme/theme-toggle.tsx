"use client";

import { useEffect, useId } from "react";
import { useDropdown } from "@/components/ui/use-dropdown";
import type { Theme } from "./theme";
import { useTheme } from "./theme-provider";

const ICONS: Record<Theme, string> = {
  light:
    "M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z",
  dark: "M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z",
  system:
    "M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25",
};
const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:focus-visible:outline-purple-400";

function Icon({ theme, className }: { theme: Theme; className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={ICONS[theme]} />
    </svg>
  );
}

/**
 * Sun/moon button that opens Light, Dark and System. The icon follows the `dark`
 * class through CSS, so it is right from the first paint and never mismatches on hydration.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { open, toggle, close, wrapper, button, panelPosition, onBlur } = useDropdown();
  const panelId = useId();

  // Opening moves focus to the current choice, so arrow-free keyboard use is one Tab away from the rest.
  useEffect(() => {
    if (open) wrapper.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, [open, wrapper]);

  return (
    <div ref={wrapper} className="relative" onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        aria-label="Theme"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={`flex size-9 items-center justify-center rounded-lg text-zinc-600 ring-1 ring-zinc-200 transition ring-inset hover:bg-zinc-100 hover:text-zinc-950 active:scale-95 motion-reduce:transition-none dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-white ${focusRing}`}
      >
        <Icon theme="light" className="size-5 dark:hidden" />
        <Icon theme="dark" className="hidden size-5 dark:block" />
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute top-full ${panelPosition} z-50 mt-2 w-40 rounded-xl bg-white p-1 shadow-xl ring-1 shadow-zinc-900/10 ring-zinc-200 dark:bg-zinc-900 dark:shadow-black/50 dark:ring-white/10`}
        >
          {OPTIONS.map((o) => {
            const selected = theme === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setTheme(o.value);
                  close({ refocus: true });
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors motion-reduce:transition-none ${focusRing} ${
                  selected
                    ? "bg-purple-50 text-purple-800 dark:bg-purple-500/15 dark:text-purple-200"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                }`}
              >
                <Icon theme={o.value} className="size-4.5 shrink-0" />
                <span className="flex-1">{o.label}</span>
                {selected && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
