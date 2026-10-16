import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));
const { platformStatus } = await import("./platform");
const { liveSources } = await import("@/server/live/config");
const { GET } = await import("@/app/get-started/route");

describe("platformStatus", () => {
  it("never calls a feature live before it is", () => {
    expect(platformStatus({ dossiersLive: false, keepaKey: true, agencyOnSale: true })).toEqual({ dossier: "LAUNCHING SOON", momentum: "LAUNCHING SOON", agency: "LAUNCHING SOON" });
    expect(platformStatus({ dossiersLive: true, keepaKey: false, agencyOnSale: false })).toEqual({ dossier: "LIVE", momentum: "LAUNCHING SOON", agency: "LAUNCHING SOON" });
    expect(platformStatus({ dossiersLive: true, keepaKey: true, agencyOnSale: true })).toEqual({ dossier: "LIVE", momentum: "LIVE", agency: "LIVE" });
  });
});

describe("GET /get-started", () => {
  it("sends new accounts to the terminal once live Dossiers are on, and to the dashboard until then", async () => {
    vi.mocked(liveSources).mockReturnValueOnce({ ready: false, missing: ["supplier source"] });
    expect((await GET()).headers.get("location")).toBe("/signin?tab=register");
    vi.mocked(liveSources).mockReturnValueOnce({ ready: true, sample: false, sources: {} as never });
    const res = await GET();
    expect([res.status, res.headers.get("location")]).toEqual([303, "/signin?tab=register&callbackUrl=%2Fterminal"]);
  });
});
