import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("@/server/auth/entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/entitlements")>()),
  getViewer: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/server/products/service", () => ({ listProducts: vi.fn(async () => [{ id: "p1" }]) }));

const { getViewer } = await import("@/server/auth/entitlements");
const { listProducts } = await import("@/server/products/service");
const { GET } = await import("./route");

const call = (query = "") => GET(new NextRequest(`http://localhost:3457/api/products${query}`));
const viewer = (tier: "FREE" | "PRO" | "AGENCY") => vi.mocked(getViewer).mockResolvedValue({ id: "u1", email: "me@example.com", tier });

describe("GET /api/products (the Pro catalog)", () => {
  beforeEach(() => vi.mocked(listProducts).mockClear());

  it("needs a signed-in account", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
    expect(listProducts).not.toHaveBeenCalled();
  });

  it("is closed to Free accounts, sample products included", async () => {
    viewer("FREE");
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("pro_required");
    expect(listProducts).not.toHaveBeenCalled();
  });

  it("lists every product, live ones included, for Pro and Business", async () => {
    for (const tier of ["PRO", "AGENCY"] as const) {
      viewer(tier);
      const res = await call("?category=beauty&limit=5");
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect((await res.json()).data).toEqual([{ id: "p1" }]);
      expect(vi.mocked(listProducts).mock.calls.at(-1)?.[1]).toEqual({ category: "beauty", limit: 5, includeLive: true });
    }
  });

  it("rejects a malformed query before checking who's asking", async () => {
    const res = await call("?category=Not%20A%20Slug");
    expect(res.status).toBe(400);
  });
});
