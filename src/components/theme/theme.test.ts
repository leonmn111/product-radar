import { describe, expect, it } from "vitest";
import { themeScript, type Theme } from "./theme";

/** Runs the <head> script against a fake page and reports whether it switched dark on. */
function runScript(defaultTheme: Theme, { saved, deviceDark = false, storageBlocked = false }: { saved?: string; deviceDark?: boolean; storageBlocked?: boolean }) {
  let dark: boolean | undefined;
  const document = { documentElement: { classList: { toggle: (name: string, on: boolean) => name === "dark" && (dark = on) } } };
  const localStorage = {
    getItem: () => {
      if (storageBlocked) throw new Error("SecurityError");
      return saved ?? null;
    },
  };
  const matchMedia = () => ({ matches: deviceDark });
  new Function("document", "localStorage", "matchMedia", themeScript(defaultTheme))(document, localStorage, matchMedia);
  return dark;
}

describe("themeScript", () => {
  it("shows new visitors the default theme", () => {
    expect(runScript("dark", {})).toBe(true);
    expect(runScript("light", {})).toBe(false);
  });

  it("keeps a saved choice over the default", () => {
    expect(runScript("dark", { saved: "light" })).toBe(false);
    expect(runScript("light", { saved: "dark" })).toBe(true);
  });

  it("follows the device for System", () => {
    expect(runScript("dark", { saved: "system", deviceDark: false })).toBe(false);
    expect(runScript("dark", { saved: "system", deviceDark: true })).toBe(true);
  });

  it("falls back to the default for junk or blocked storage", () => {
    expect(runScript("dark", { saved: "purple" })).toBe(true);
    expect(runScript("dark", { storageBlocked: true })).toBe(true);
  });
});
