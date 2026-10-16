// Integration test: the real route, the real x402 middleware (mock facilitator: signatures are fully
// verified, no funds move) and the real Dossier builder. Only the database and the data sources are
// faked, so nothing here calls a paid provider (CLAUDE.md Rule 8).

import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetailListing } from "@/server/live/types";
import type { RetailSource, SupplierSource } from "@/server/sources/types";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    X402_MODE: "mock",
    X402_PAY_TO: "0x92bD141F0e64a10e8dcE1f40f0DaB65a5D402514",
    LIVE_SAMPLE_DATA: "",
  });
});
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", () => ({
  db: { agentPayment: { create: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})) } },
}));
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));

const { liveSources } = await import("@/server/live/config");
const { db } = await import("@/lib/db");
const { EIP3009_TYPES, encodeHeader, HEADER_REQUIRED, HEADER_RESPONSE, HEADER_SIGNATURE } = await import("@/server/payments/x402/protocol");
const { HEADER_BAZAAR, HEADER_PAYMENT_ID, HEADER_PRICE } = await import("@/server/payments/x402/discovery");
const { GET } = await import("./route");

// Fixed throwaway test key: never holds funds.
const payer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const URL_BASE = "http://localhost:3457/api/agent/v2/search";
const decode = (header: string | null) => JSON.parse(Buffer.from(header ?? "", "base64").toString("utf8"));

const listing = (over: Partial<RetailListing> = {}): RetailListing => ({
  market: "GB",
  id: "B0TESTMUG1",
  title: "Plain White Ceramic Coffee Mug 350ml",
  url: "https://www.amazon.co.uk/dp/B0TESTMUG1",
  image: null,
  price: { amount: 12.99, currency: "GBP" },
  rating: 4.4,
  ratingsTotal: 120,
  sponsored: false,
  recentSales: null,
  evidence: {
    id: "rainforest:amazon.co.uk:B0TESTMUG1",
    provider: "rainforest",
    sourceUrl: "https://www.amazon.co.uk/dp/B0TESTMUG1",
    observedAt: new Date().toISOString(),
    quality: 80,
    claim: "Listed on Amazon UK at £12.99",
  },
  ...over,
});

// Thin evidence: one Amazon UK listing and no supplier match, so confidence is well below 0.5.
const retail: RetailSource = { name: "rainforest (test)", search: vi.fn(async () => [listing()]) };
const supplier: SupplierSource = { name: "aliexpress (test)", search: vi.fn(async () => []) };

const call = (query: string, headers: Record<string, string> = {}) => GET(new NextRequest(`${URL_BASE}${query}`, { headers }));

/** Signs an EIP-3009 USDC authorization for the terms in a 402 response, like an agent's wallet would. */
async function payFor(required: { accepts: Record<string, unknown>[] }) {
  const accepted = required.accepts[0] as { payTo: `0x${string}`; amount: string; asset: `0x${string}`; extra: { name: string; version: string } };
  const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as `0x${string}`;
  const authorization = {
    from: payer.address,
    to: accepted.payTo,
    value: accepted.amount,
    validAfter: "0",
    validBefore: String(Math.floor(Date.now() / 1000) + 60),
    nonce,
  };
  const signature = await payer.signTypedData({
    domain: { name: accepted.extra.name, version: accepted.extra.version, chainId: 84532, verifyingContract: accepted.asset },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(0), validBefore: BigInt(authorization.validBefore) },
  });
  return encodeHeader({ x402Version: 2, accepted, payload: { signature, authorization } });
}

describe("GET /api/agent/v2/search", () => {
  beforeEach(() => {
    vi.mocked(liveSources).mockReturnValue({ ready: true, sample: false, sources: { retail, supplier } });
    vi.mocked(db.agentPayment.create).mockClear();
  });

  it("a search with under 0.5 confidence is paid for and returns a Dossier without its verdict or numbers", async () => {
    // 1. No payment yet: 402 at $0.01 USDC, with the discovery headers.
    const unpaid = await call("?q=ceramic+coffee+mug");
    expect(unpaid.status).toBe(402);
    expect(unpaid.headers.get(HEADER_PRICE)).toBe("0.01");
    expect(unpaid.headers.get(HEADER_PAYMENT_ID)).toMatch(/^[0-9a-f]{64}$/);
    const required = decode(unpaid.headers.get(HEADER_REQUIRED));
    expect(required.accepts[0]).toMatchObject({ scheme: "exact", network: "eip155:84532", amount: "10000" });
    expect(retail.search).not.toHaveBeenCalled(); // nothing is fetched before payment

    // 2. Paid: 200, settled, with a Dossier whose gated parts are withheld.
    const res = await call("?q=ceramic+coffee+mug", { [HEADER_SIGNATURE]: await payFor(required) });
    expect(res.status).toBe(200);
    expect(decode(res.headers.get(HEADER_RESPONSE))).toMatchObject({ success: true, amount: "10000" });
    expect(db.agentPayment.create).toHaveBeenCalledTimes(1);
    expect(res.headers.get(HEADER_PRICE)).toBe("0.01");
    const paymentId = res.headers.get(HEADER_PAYMENT_ID);
    expect(paymentId).toMatch(/^[0-9a-f]{64}$/);
    expect(paymentId).not.toBe(unpaid.headers.get(HEADER_PAYMENT_ID)); // a fresh identifier per request
    expect(JSON.parse(res.headers.get(HEADER_BAZAAR) ?? "[]")).toContainEqual(
      expect.objectContaining({ method: "GET", path: "/api/agent/v2/search", priceUsdc: "0.01", scheme: "exact" }),
    );

    const dossier = await res.json();
    expect(dossier.id).toBe(paymentId);
    expect(dossier.sample).toBe(false);
    expect(dossier.verdict.confidence).toBeLessThan(0.5);
    expect(dossier.verdict).toMatchObject({ status: "withheld", reason: "Insufficient Data" });
    expect(dossier.verdict).not.toHaveProperty("value");
    for (const part of ["landedMargin", "saturation", "momentum"]) {
      expect(dossier[part]).toMatchObject({ status: "withheld", reason: "Insufficient Data" });
      expect(dossier[part]).not.toHaveProperty("value");
      expect(dossier[part].missing.length).toBeGreaterThan(0);
    }
    // What's shown is still cited: the one listing, and no supplier matches.
    expect(dossier.supplierMatches).toEqual([]);
    expect(dossier.evidence.map((e: { id: string }) => e.id)).toEqual(["rainforest:amazon.co.uk:B0TESTMUG1"]);
    expect(dossier.resellability.trademarkRisk.value).toBe(false);
  });

  it("rejects a bad query before asking for payment, still with the x402 headers", async () => {
    for (const q of ["", "?q=x"]) {
      const res = await call(q);
      expect(res.status).toBe(400);
      expect(res.headers.get(HEADER_PRICE)).toBe("0.01");
      expect(res.headers.get(HEADER_PAYMENT_ID)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("says live search isn't on yet, before asking for payment", async () => {
    vi.mocked(liveSources).mockReturnValue({ ready: false, missing: ["supplier source: the AliExpress affiliate API isn't connected yet"] });
    const res = await call("?q=ceramic+coffee+mug");
    expect(res.status).toBe(503);
    expect((await res.json()).missing).toHaveLength(1);
    expect(res.headers.get(HEADER_PRICE)).toBe("0.01");
  });

  it("doesn't charge for a search with no listings", async () => {
    vi.mocked(retail.search).mockResolvedValueOnce([]);
    const required = decode((await call("?q=nothing+matches")).headers.get(HEADER_REQUIRED));
    const res = await call("?q=nothing+matches", { [HEADER_SIGNATURE]: await payFor(required) });
    expect(res.status).toBe(404);
    expect(res.headers.get(HEADER_RESPONSE)).toBeNull(); // not settled
    expect(db.agentPayment.deleteMany).toHaveBeenCalled(); // the reserved nonce is released
  });
});
