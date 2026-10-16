// Integration test: the real route, the real x402 middleware (mock facilitator: payment signatures are
// fully verified, no funds move), real Sign-In-With-X checks and the real Dossier builder. The database
// is an in-memory stand-in and the data sources are fakes, so nothing calls a paid provider (Rule 8).

import { NextRequest } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetailListing, RetailProductDetail, SupplierOffer } from "@/server/live/types";
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

// In-memory tables with the database's uniqueness rules.
const mem = vi.hoisted(() => ({
  payments: [] as Record<string, unknown>[],
  nonces: new Set<string>(),
  dossiers: new Map<string, unknown>(),
  cache: new Map<string, { dossier: unknown; expiresAt: Date }>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", async () => {
  const { Prisma } = await import("@/generated/prisma/client");
  const duplicate = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
  type Row = Record<string, unknown>;
  return {
    db: {
      agentPayment: {
        create: vi.fn(async ({ data }: { data: Row }) => {
          if (mem.payments.some((p) => p.nonce === data.nonce)) throw duplicate();
          mem.payments.push({ ...data, status: "RESERVED" });
          return data;
        }),
        update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => Object.assign(mem.payments.find((p) => p.nonce === where.nonce)!, data)),
        deleteMany: vi.fn(async ({ where }: { where: Row }) => {
          const before = mem.payments.length;
          mem.payments = mem.payments.filter((p) => !(p.nonce === where.nonce && p.status === where.status));
          return { count: before - mem.payments.length };
        }),
        findFirst: vi.fn(async ({ where }: { where: { payer: { equals: string }; resourcePath: string; status: string } }) => {
          const rows = mem.payments.filter(
            (p) =>
              String(p.payer).toLowerCase() === where.payer.equals.toLowerCase() && p.resourcePath === where.resourcePath && p.status === where.status && p.reference,
          );
          return rows.at(-1) ?? null;
        }),
      },
      siwxNonce: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async ({ data }: { data: { nonce: string } }) => {
          if (mem.nonces.has(data.nonce)) throw duplicate();
          mem.nonces.add(data.nonce);
          return data;
        }),
      },
      dossierCache: {
        findUnique: vi.fn(async ({ where }: { where: { marketplace_productId: { productId: string } } }) => mem.cache.get(where.marketplace_productId.productId) ?? null),
        upsert: vi.fn(async ({ where, create }: { where: { marketplace_productId: { productId: string } }; create: { dossier: unknown; expiresAt: Date } }) =>
          mem.cache.set(where.marketplace_productId.productId, create),
        ),
      },
      dossierRecord: {
        create: vi.fn(async ({ data }: { data: { id: string; body: unknown } }) => mem.dossiers.set(data.id, data.body)),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (mem.dossiers.has(where.id) ? { body: mem.dossiers.get(where.id) } : null)),
      },
    },
  };
});
vi.mock("@/server/live/config", () => ({ liveSources: vi.fn() }));

const { liveSources } = await import("@/server/live/config");
const { EIP3009_TYPES, encodeHeader, HEADER_REQUIRED, HEADER_RESPONSE, HEADER_SIGNATURE } = await import("@/server/payments/x402/protocol");
const { HEADER_BAZAAR, HEADER_PAYMENT_ID, HEADER_PRICE } = await import("@/server/payments/x402/discovery");
const { formatSiweMessage, HEADER_SIWX } = await import("@/server/payments/x402/siwx");
const { GET } = await import("./route");
const { GET: GET_QUERY } = await import("../route");

// Fixed throwaway test keys: never hold funds.
const buyer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const BASE = "http://localhost:3457/api/agent/v2/dossier";
const ASIN = "B0TESTMUG1";
const TITLE = "Plain White Ceramic Coffee Mug 350ml";
const now = () => new Date().toISOString();
const decode = (header: string | null) => JSON.parse(Buffer.from(header ?? "", "base64").toString("utf8"));

const listing = (id: string): RetailListing => ({
  market: "GB",
  id,
  title: TITLE,
  url: `https://www.amazon.co.uk/dp/${id}`,
  image: null,
  price: { amount: 12.99, currency: "GBP" },
  rating: 4.5,
  ratingsTotal: 300,
  sponsored: false,
  recentSales: null,
  evidence: { id: `rainforest:amazon.co.uk:${id}`, provider: "rainforest", sourceUrl: `https://www.amazon.co.uk/dp/${id}`, observedAt: now(), quality: 90, claim: `Listed at £12.99` },
});
const page = (): RetailProductDetail => ({
  listing: { ...listing(ASIN), evidence: { ...listing(ASIN).evidence, id: `rainforest:amazon.co.uk:${ASIN}:page` } },
  brand: null,
  sellerName: "Mug Traders Ltd",
  soldByAmazon: false,
  category: "Home & Kitchen > Mugs",
  bulletPoints: ["Dishwasher safe", "350ml"],
  description: null,
});
const offer = (n: number): SupplierOffer => ({
  id: `ae${n}`,
  title: "Ceramic Coffee Mug 350ml Plain White",
  url: `https://www.aliexpress.com/item/${n}.html`,
  image: null,
  unitPrice: { amount: 2.1 + n / 10, currency: "GBP" },
  shipping: null,
  shipsTo: "GB",
  evidence: { id: `aliexpress:${n}`, provider: "aliexpress", sourceUrl: `https://www.aliexpress.com/item/${n}.html`, observedAt: now(), quality: 80, claim: "Offered" },
});

// A well-corroborated, unbranded product: its page, three more listings of it, two supplier matches.
const retail: RetailSource = {
  name: "rainforest (test)",
  product: vi.fn(async (id: string) => (id === ASIN ? page() : null)),
  search: vi.fn(async () => ["B0TESTMUG2", "B0TESTMUG3", "B0TESTMUG4"].map(listing)),
};
const supplier: SupplierSource = { name: "aliexpress (test)", search: vi.fn(async () => [offer(1), offer(2)]) };

const call = (path: string, headers: Record<string, string> = {}) => {
  const asin = path.split("?")[0];
  return GET(new NextRequest(`${BASE}/${path}`, { headers }), { params: Promise.resolve({ asin }) });
};

/** Signs an EIP-3009 USDC authorization for the terms in a 402, like an agent's wallet. */
async function payFor(required: { accepts: Record<string, unknown>[] }, signer = buyer) {
  const accepted = required.accepts[0] as { payTo: `0x${string}`; amount: string; asset: `0x${string}`; extra: { name: string; version: string } };
  const authorization = {
    from: signer.address,
    to: accepted.payTo,
    value: accepted.amount,
    validAfter: "0",
    validBefore: String(Math.floor(Date.now() / 1000) + 60),
    nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as `0x${string}`,
  };
  const signature = await signer.signTypedData({
    domain: { name: accepted.extra.name, version: accepted.extra.version, chainId: 84532, verifyingContract: accepted.asset },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(0), validBefore: BigInt(authorization.validBefore) },
  });
  return encodeHeader({ x402Version: 2, accepted, payload: { signature, authorization } });
}

/** Signs the 402's Sign-In-With-X challenge, like an x402 client (EIP-4361 text, personal_sign). */
async function signInFor(required: { extensions: Record<string, { info: Record<string, unknown>; supportedChains: { chainId: string; type: string }[] }> }, signer = buyer) {
  const ext = required.extensions["sign-in-with-x"];
  const fields = { ...ext.info, address: signer.address, chainId: ext.supportedChains[0].chainId, type: ext.supportedChains[0].type };
  const signature = await signer.signMessage({ message: formatSiweMessage(fields as never) });
  return Buffer.from(JSON.stringify({ ...fields, signature })).toString("base64");
}

const challenge = async (path = ASIN) => decode((await call(path)).headers.get(HEADER_REQUIRED));

describe("GET /api/agent/v2/dossier/{asin}", () => {
  beforeEach(() => {
    vi.mocked(liveSources).mockReturnValue({ ready: true, sample: false, sources: { retail, supplier } });
    vi.mocked(retail.product).mockClear();
    vi.mocked(retail.search).mockClear();
  });

  it("costs $2.00, then reopens free for the wallet that bought it, from the copy it was sold", async () => {
    // 1. No payment: 402 at $2.00 USDC, offering Sign-In-With-X for this exact path.
    const unpaid = await call(ASIN);
    expect(unpaid.status).toBe(402);
    expect(unpaid.headers.get(HEADER_PRICE)).toBe("2.00");
    const required = decode(unpaid.headers.get(HEADER_REQUIRED));
    expect(required.accepts[0]).toMatchObject({ scheme: "exact", amount: "2000000" });
    expect(required.extensions["sign-in-with-x"].info).toMatchObject({ domain: "localhost:3457", uri: `${BASE}/${ASIN}` });
    expect(JSON.parse(unpaid.headers.get(HEADER_BAZAAR) ?? "[]")).toContainEqual(
      expect.objectContaining({ path: "/api/agent/v2/dossier/{asin}", priceUsdc: "2.00", extensions: ["sign-in-with-x"] }),
    );
    expect(retail.product).not.toHaveBeenCalled(); // nothing is fetched before payment

    // 2. Paid: the full Dossier, settled and kept.
    const bought = await call(ASIN, { [HEADER_SIGNATURE]: await payFor(required) });
    expect(bought.status).toBe(200);
    expect(bought.headers.get(HEADER_PRICE)).toBe("2.00");
    expect(decode(bought.headers.get(HEADER_RESPONSE))).toMatchObject({ success: true, amount: "2000000" });
    const dossier = await bought.json();
    expect(dossier.id).toBe(bought.headers.get(HEADER_PAYMENT_ID));
    expect(dossier.product).toMatchObject({ title: TITLE, identifiers: { asin: ASIN } });
    expect(dossier.verdict.status).toBe("shown");
    expect(dossier.landedMargin.status).toBe("shown"); // four listings + two suppliers clear 0.7
    expect(mem.payments.at(-1)).toMatchObject({ status: "SETTLED", resourcePath: `/api/agent/v2/dossier/${ASIN}`, reference: dossier.id });
    expect(retail.product).toHaveBeenCalledTimes(1);

    // 3. Reopen: sign the challenge instead of paying. Free, the same Dossier, no provider calls.
    const reopened = await call(ASIN, { [HEADER_SIWX]: await signInFor(await challenge()) });
    expect(reopened.status).toBe(200);
    expect(reopened.headers.get(HEADER_PRICE)).toBe("0.00");
    expect(reopened.headers.get(HEADER_PAYMENT_ID)).toBe(dossier.id);
    expect(reopened.headers.get(HEADER_RESPONSE)).toBeNull(); // nothing settled
    expect(await reopened.json()).toEqual(dossier);
    expect(retail.product).toHaveBeenCalledTimes(1);
    expect(mem.payments.filter((p) => p.status === "SETTLED")).toHaveLength(1);
  });

  it("serves a second buyer within 48 hours from the cache: paid in full, no provider calls, their own id", async () => {
    vi.mocked(retail.product).mockClear();
    const res = await call(ASIN, { [HEADER_SIGNATURE]: await payFor(await challenge(), stranger) });
    expect([res.status, res.headers.get("x-dossier-cache"), res.headers.get(HEADER_PRICE)]).toEqual([200, "hit", "2.00"]);
    expect(decode(res.headers.get(HEADER_RESPONSE))).toMatchObject({ success: true });
    expect([retail.product, retail.search, supplier.search].map((f) => vi.mocked(f).mock.calls.length)).toEqual([0, 0, 0]);
    const d = await res.json();
    expect(d.id).toBe(res.headers.get(HEADER_PAYMENT_ID));
    expect(d.notes.at(-1)).toContain("From the 48-hour cache");
    expect(mem.dossiers.get(d.id)).toEqual(d); // their copy is kept for reopening
  });

  it("asks for $2.00 again when the sign-in proof is replayed, from another wallet, or for another Dossier", async () => {
    const proof = await signInFor(await challenge());
    expect((await call(ASIN, { [HEADER_SIWX]: proof })).status).toBe(200); // bought in the test above

    const replay = await call(ASIN, { [HEADER_SIWX]: proof });
    expect([replay.status, replay.headers.get(HEADER_PRICE), (await replay.json()).error]).toEqual([402, "2.00", "invalid_siwx_nonce"]);

    const other = await call(ASIN, { [HEADER_SIWX]: await signInFor(await challenge(), privateKeyToAccount(generatePrivateKey())) });
    expect([other.status, (await other.json()).error]).toEqual([402, "siwx_no_purchase"]);

    const elsewhere = await call("B0OTHERMUG", { [HEADER_SIWX]: await signInFor(await challenge()) });
    expect([elsewhere.status, (await elsewhere.json()).error]).toEqual([402, "invalid_siwx_uri_mismatch"]);
  });

  it("doesn't charge for a product Amazon UK doesn't have", async () => {
    const required = await challenge("B0NOTHERE1");
    const res = await call("B0NOTHERE1", { [HEADER_SIGNATURE]: await payFor(required) });
    expect(res.status).toBe(404);
    expect(res.headers.get(HEADER_RESPONSE)).toBeNull();
    expect(mem.payments.some((p) => p.resourcePath === "/api/agent/v2/dossier/B0NOTHERE1")).toBe(false); // reservation released
  });

  it("checks the ASIN before payment, and gives each Dossier one address", async () => {
    const bad = await call("not-an-asin");
    expect([bad.status, bad.headers.get(HEADER_PRICE)]).toEqual([400, "2.00"]);
    const lower = await call("b0testmug1");
    expect([lower.status, lower.headers.get("location")]).toEqual([308, `${BASE}/${ASIN}`]);
    const byQuery = await GET_QUERY(new NextRequest(`${BASE}?productId=${ASIN}`));
    expect([byQuery.status, byQuery.headers.get("location")]).toEqual([308, `${BASE}/${ASIN}`]);
    expect((await GET_QUERY(new NextRequest(`${BASE}?asin=x`))).status).toBe(400);
  });

  it("says live Dossiers aren't on yet, before payment, unless a buyer is reopening one", async () => {
    vi.mocked(liveSources).mockReturnValue({ ready: false, missing: ["supplier source: the AliExpress affiliate API isn't connected yet"] });
    const res = await call(ASIN);
    expect([res.status, res.headers.get(HEADER_PRICE)]).toEqual([503, "2.00"]);
  });
});
