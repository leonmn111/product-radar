// Light, dark or follow the device. The choice lives in localStorage (per browser),
// and the `dark` class on <html> is what every `dark:` style keys off (globals.css).
// An inline script in the root layout applies it before the first paint, so a saved
// light theme never flashes dark (or the other way round) on load.

export type Theme = "light" | "dark" | "system";
export const THEMES: readonly Theme[] = ["light", "dark", "system"];
export const STORAGE_KEY = "theme";

export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);

/** The saved choice, or the default when there's none (or storage is blocked). */
export function readTheme(defaultTheme: Theme): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function writeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice still applies until the page reloads.
  }
}

const systemPrefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/** The same logic as readTheme + applyTheme, as a tiny script for <head>. */
export function themeScript(defaultTheme: Theme) {
  return `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})}catch(e){}if(${JSON.stringify(THEMES)}.indexOf(t)<0)t=${JSON.stringify(defaultTheme)};var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)})()`;
}
