"use client";

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { applyTheme, readTheme, STORAGE_KEY, writeTheme, type Theme } from "./theme";

type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the theme: follow it.
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Holds the visitor's theme choice for the toggle. The page's colours never wait for
 * React: the inline script in the root layout has already set them before paint.
 */
export function ThemeProvider({ defaultTheme, children }: { defaultTheme: Theme; children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    () => readTheme(defaultTheme),
    () => defaultTheme,
  );

  // Re-apply from storage, the source of truth: in development React's remount clears
  // the class the inline script set on <html>; in production this changes nothing.
  useLayoutEffect(() => applyTheme(readTheme(defaultTheme)), [theme, defaultTheme]);

  // "System" follows the device live, e.g. when macOS switches to dark at sunset.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    writeTheme(next);
    applyTheme(next);
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const value = use(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
