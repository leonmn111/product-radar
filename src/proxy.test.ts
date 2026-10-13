import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { canViewDossier } from "@/server/auth/entitlements";
import { config, hasSessionCookie, proxy } from "./proxy";

// vi.mock is hoisted above the imports: entitlements must not load the real Auth.js setup.
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

describe("proxy: signed-in visitors skip the landing page", () => {
  it("recognises Auth.js session cookies on http and https, whole or split", () => {
    expect(hasSessionCookie(["authjs.session-token"])).toBe(true);
    expect(hasSessionCookie(["__Secure-authjs.session-token"])).toBe(true);
    expect(hasSessionCookie(["__Secure-authjs.session-token.0", "__Secure-authjs.session-token.1"])).toBe(true);
    expect(hasSessionCookie(["authjs.csrf-token", "authjs.callback-url"])).toBe(false);
    expect(hasSessionCookie(["authjs.session-tokenX"])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });

  it("sends a signed-in visitor to the dashboard, keeping the query", () => {
    const req = new NextRequest("https://theproductradar.io/?checkout=cancelled", {
      headers: { cookie: "__Secure-authjs.session-token=abc" },
    });
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://theproductradar.io/dashboard?checkout=cancelled");
  });

  it("lets everyone else see the landing page", () => {
    const res = proxy(new NextRequest("https://theproductradar.io/", { headers: { cookie: "authjs.csrf-token=x" } }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("only runs on the home page", () => {
    expect(config.matcher).toBe("/");
  });
});

describe("canViewDossier", () => {
  const free = { id: "u1", email: "me@example.com", tier: "FREE" as const };
  const pro = { ...free, tier: "PRO" as const };
  const live = { isSample: false, showcased: false };

  it("opens any product to Pro", () => {
    expect(canViewDossier(pro, live)).toBe(true);
  });

  it("opens samples and showcased live products to everyone", () => {
    for (const v of [null, free]) {
      expect(canViewDossier(v, { isSample: true, showcased: false })).toBe(true);
      expect(canViewDossier(v, { isSample: false, showcased: true })).toBe(true);
      expect(canViewDossier(v, live)).toBe(false);
    }
  });
});
