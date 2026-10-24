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
vi.mock("@/server/products/service", () => ({ getProduct: vi.fn() }));

const { getViewer } = await import("@/server/auth/entitlements");
const { getProduct } = await import("@/server/products/service");
const { GET } = await import("./route");

const product = {
  id: "0199a0a0-0000-7000-8000-00000c406b2f",
  name: "Kestrel Buds Pro | Shop",
  brand: "Kestrel",
  description: "Small buds.",
  category: "wireless-earbuds",
  imageUrl: null,
  bestOffer: { merchant: "Shop", url: "https://shop.test", price: { amount: "40.00", currency: "GBP" } },
  resellable: true,
  resaleRisk: null,
  margin: null,
};
const call = (query = "", id = product.id) =>
  GET(new NextRequest(`http://localhost:3457/api/products/${id}/shopify-csv${query}`), { params: Promise.resolve({ id }) });
const viewer = (tier: "FREE" | "PRO" | "AGENCY") => vi.mocked(getViewer).mockResolvedValue({ id: "u1", email: "me@example.com", tier });

describe("GET /api/products/:id/shopify-csv (the Pro Shopify export)", () => {
  beforeEach(() => {
    vi.mocked(getProduct).mockReset();
    vi.mocked(getProduct).mockResolvedValue(product as never);
  });

  it("needs a signed-in account", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(getProduct).not.toHaveBeenCalled();
  });

  it("is closed to Free accounts", async () => {
    viewer("FREE");
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("pro_required");
    expect(getProduct).not.toHaveBeenCalled();
  });

  it("sends Pro and Business a CSV file to download, named after the product", async () => {
    for (const tier of ["PRO", "AGENCY"] as const) {
      viewer(tier);
      const res = await call();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="kestrel-buds-pro-shopify.csv"');
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const [header, row] = (await res.text()).trim().split("\r\n");
      expect(header.startsWith('"Handle","Title","Body (HTML)"')).toBe(true);
      expect(row).toContain('"kestrel-buds-pro","Kestrel Buds Pro"');
      expect(vi.mocked(getProduct).mock.calls.at(-1)?.[1]).toBe(product.id);
    }
  });

  it("uses the cost typed into the calculator, and never estimates one", async () => {
    viewer("PRO");
    expect(await (await call("?cost=12.5")).text()).toContain('"12.50","draft"');
    expect(await (await call()).text()).toContain('"","draft"');
  });

  it("exports a product that fails a resale check only once its warning was confirmed", async () => {
    viewer("PRO");
    vi.mocked(getProduct).mockResolvedValue({ ...product, resellable: false, resaleRisk: "ip" } as never);
    const refused = await call("?cost=12.5");
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe("risk_not_acknowledged");
    expect((await call("?cost=12.5&acknowledgeRisk=compliance")).status).toBe(409); // a different risk than the product's
    const res = await call("?cost=12.5&acknowledgeRisk=ip");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"12.50","draft"');
  });

  it("rejects a bad cost, and says when the product doesn't exist", async () => {
    viewer("PRO");
    expect((await call("?cost=-3")).status).toBe(400);
    vi.mocked(getProduct).mockResolvedValue(null);
    expect((await call("", "missing")).status).toBe(404);
  });
});
