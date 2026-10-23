import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    X402_MODE: "mock",
    X402_PAY_TO: "0x92bD141F0e64a10e8dcE1f40f0DaB65a5D402514",
  });
});
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
const { GET } = await import("./route");

const manifest = async () => {
  const res = await GET(new NextRequest("http://localhost:3457/api/agent/v2/bazaar"));
  return { res, body: await res.json() };
};

describe("GET /api/agent/v2/bazaar", () => {
  it("lists the paid endpoints in the x402 discovery format, with their live USDC terms", async () => {
    const { res, body } = await manifest();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(body).toMatchObject({ x402Version: 2, pagination: { limit: 2, offset: 0, total: 2 } });
    expect(body.items.map((i: { resource: string; accepts: { amount: string; scheme: string; network: string }[] }) => [i.resource, i.accepts[0].amount, i.accepts[0].scheme])).toEqual([
      ["http://localhost:3457/api/agent/v2/search", "50000", "exact"], // $0.05
      ["http://localhost:3457/api/agent/v2/dossier/:asin", "2000000", "exact"], // $2.00
    ]);
    for (const item of body.items) {
      expect(item).toMatchObject({ type: "http", x402Version: 2, mimeType: "application/json", serviceName: "ProductRadar" });
      expect(item.accepts[0]).toMatchObject({ payTo: "0x92bD141F0e64a10e8dcE1f40f0DaB65a5D402514", network: "eip155:84532" });
      expect(item.tags.length).toBeLessThanOrEqual(5);
      expect(new Date(item.lastUpdated).toISOString()).toBe(item.lastUpdated);
    }
  });

  it("tells an agent what each returns and how to call it", async () => {
    const { body } = await manifest();
    const [search, dossier] = body.items;
    for (const part of ["Verdict", "Resellability", "Landed margin", "Momentum", "Saturation", "Supplier matches", "Evidence", "Exports"]) {
      expect(dossier.description).toContain(part);
    }
    // info.input holds example values; the schema holds the rules (as the x402 bazaar validator expects).
    expect(search.extensions.bazaar.info.input).toEqual({ type: "http", method: "GET", queryParams: { q: "ceramic coffee mug" } });
    expect(search.extensions.bazaar.schema.properties.input.properties.queryParams).toMatchObject({ properties: { q: { type: "string" } }, required: ["q"] });
    expect(dossier.extensions.bazaar).toMatchObject({ routeTemplate: "/api/agent/v2/dossier/:asin", info: { input: { pathParams: { asin: "B0CH33F5P2" } } } });
    expect(dossier.extensions.bazaar.schema.properties.input.properties.pathParams.properties.asin.pattern).toBe("^[A-Z0-9]{10}$");
    expect(dossier.extensions).toHaveProperty("sign-in-with-x");
  });
});
