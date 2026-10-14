import { describe, expect, it } from "vitest";
import { safeCallback } from "./callback-url";

describe("safeCallback", () => {
  it("lands new and returning users on the dashboard when no destination is given", () => {
    expect(safeCallback(undefined)).toBe("/dashboard");
    expect(safeCallback("")).toBe("/dashboard");
  });

  it("keeps a same-site destination, such as an explicit upgrade", () => {
    expect(safeCallback("/upgrade")).toBe("/upgrade");
    expect(safeCallback(["/dossier/ooni-koda-2", "/x"])).toBe("/dossier/ooni-koda-2");
  });

  it("refuses other sites", () => {
    expect(safeCallback("https://evil.example")).toBe("/dashboard");
    expect(safeCallback("//evil.example")).toBe("/dashboard");
  });
});
