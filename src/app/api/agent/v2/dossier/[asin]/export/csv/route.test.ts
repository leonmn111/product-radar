// GET /api/agent/v2/dossier/{asin}/export/csv: the Shopify file for whoever bought the Dossier. The
// real route, real Sign-In-With-X checks and the real CSV engine, over an in-memory stand-in for the
// database.

import { NextRequest } from "next/server";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetailListing, SupplierOffer } from "@/server/live/types";
import type { Dossier } from "@/types/dossier";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    X402_MODE: "mock",
    X402_PAY_TO: "0x92bD141F0e64a10e8dcE1f40f0DaB65a5D402514",
  });
});
const mem = vi.hoisted(() => ({
  records: [] as { id: string; productKey: string; body: unknown }[],
  ledger: [] as { userId: string; kind: string; reference: string }[],
  payments: [] as { payer: string; resourcePath: string; status: string; reference: string }[],
  nonces: new Set<string>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/server/auth/entitlements", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { Prisma } = await import("@/generated/prisma/client");
  return {
    db: {
      dossierRecord: {
        findMany: vi.fn(async ({ where }: { where: { productKey: string } }) => mem.records.filter((r) => r.productKey === where.productKey).reverse()),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mem.records.find((r) => r.id === where.id) ?? null),
      },
      creditLedgerEntry: {
        findMany: vi.fn(async ({ where }: { where: { userId: string; reference: { in: string[] } } }) =>
          mem.ledger.filter((e) => e.userId === where.userId && where.reference.in.includes(e.reference)),
        ),
      },
      agentPayment: {
        findFirst: vi.fn(async ({ where }: { where: { payer: { equals: string }; resourcePath: string; status: string } }) =>
          mem.payments.find((p) => p.payer.toLowerCase() === where.payer.equals.toLowerCase() && p.resourcePath === where.resourcePath && p.status === where.status) ?? null,
        ),
      },
      siwxNonce: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async ({ data }: { data: { nonce: string } }) => {
          if (mem.nonces.has(data.nonce)) throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
          mem.nonces.add(data.nonce);
        }),
      },
    },
  };
});

const { getViewer } = await import("@/server/auth/entitlements");
const { buildDossier } = await import("@/services/dossierService");
const { formatSiweMessage, HEADER_SIWX } = await import("@/server/payments/x402/siwx");
const { HEADER_REQUIRED } = await import("@/server/payments/x402/protocol");
const { GET } = await import("./route");

const ASIN = "B0MUGAAAA1";
const BASE = "http://localhost:3457/api/agent/v2/dossier";
const NOW = new Date();
const listing = (id: string, price = 12.99): RetailListing => ({
  market: "GB",
  id,
  title: "Plain White Ceramic Coffee Mug 350ml",
  url: `https://www.amazon.co.uk/dp/${id}`,
  image: null,
  price: { amount: price, currency: "GBP" },
  rating: null,
  ratingsTotal: null,
  sponsored: false,
  recentSales: null,
  evidence: { id: `rainforest:amazon.co.uk:${id}`, provider: "rainforest", sourceUrl: `https://www.amazon.co.uk/dp/${id}`, observedAt: NOW.toISOString(), quality: 90, claim: "listed" },
});
const offer = (n: number): SupplierOffer => ({
  id: `ae${n}`,
  title: "Ceramic Coffee Mug 350ml White Plain",
  url: `https://www.aliexpress.com/item/${n}.html`,
  image: `https://ae01.alicdn.com/kf/mug${n}.jpg`,
  unitPrice: { amount: 2.1, currency: "GBP" },
  shipping: null,
  shipsTo: "GB",
  evidence: { id: `aliexpress:${n}`, provider: "aliexpress", sourceUrl: `https://www.aliexpress.com/item/${n}.html`, observedAt: NOW.toISOString(), quality: 80, claim: "offered" },
});
// Each copy is priced differently, so a test can tell which copy's file it was sent.
const dossier = (id: string, listings: string[], offers: number[], price = 12.99): Dossier =>
  buildDossier({ query: ASIN, productId: listings[0], ukListings: listings.map((l) => listing(l, price)), suppliers: offers.map(offer) }, { id, now: NOW });
const keep = (d: Dossier) => mem.records.push({ id: d.id, productKey: `amazon.co.uk:${d.product.identifiers.asin}`, body: d });

const buyer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const call = (asin: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(`${BASE}/${asin}/export/csv`, { headers }), { params: Promise.resolve({ asin }) });
const decode = (h: string | null) => JSON.parse(Buffer.from(h ?? "", "base64").toString("utf8"));
/** Signs the export URL's own sign-in challenge, like an x402 client. */
async function signIn(signer = buyer, asin = ASIN) {
  const ext = decode((await call(asin)).headers.get(HEADER_REQUIRED)).extensions["sign-in-with-x"];
  const fields = { ...ext.info, address: signer.address, chainId: ext.supportedChains[0].chainId, type: "eip191" };
  const signature = await signer.signMessage({ message: formatSiweMessage(fields) });
  return Buffer.from(JSON.stringify({ ...fields, signature })).toString("base64");
}

describe("GET /api/agent/v2/dossier/{asin}/export/csv", () => {
  beforeEach(() => vi.mocked(getViewer).mockResolvedValue(null));
  keep(dossier("dossier-wallet", [ASIN, "B0MUGAAAA2", "B0MUGAAAA3", "B0MUGAAAA4"], [1, 2]));
  keep(dossier("dossier-credits", [ASIN, "B0MUGAAAA2", "B0MUGAAAA3", "B0MUGAAAA4"], [2], 13.49));
  keep(dossier("dossier-thin", ["B0THINAAA1"], []));
  mem.payments.push({ payer: buyer.address, resourcePath: `/api/agent/v2/dossier/${ASIN}`, status: "SETTLED", reference: "dossier-wallet" });
  mem.ledger.push(
    { userId: "user_paid", kind: "SPEND", reference: "dossier-credits" },
    { userId: "user_refunded", kind: "SPEND", reference: "dossier-credits" },
    { userId: "user_refunded", kind: "REFUND", reference: "dossier-credits" },
    { userId: "user_thin", kind: "SPEND", reference: "dossier-thin" },
  );
  const asUser = (id: string) => vi.mocked(getViewer).mockResolvedValue({ id, email: "me@example.com", tier: "FREE" });

  it("sends the Shopify file to the person who paid credits for the Dossier", async () => {
    asUser("user_paid");
    const res = await call(ASIN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="productradar-${ASIN}-shopify.csv"`);
    const csv = await res.text();
    expect(csv.split("\r\n")[0]).toBe(
      '"Handle","Title","Body (HTML)","Vendor","Type","Tags","Published","Option1 Name","Option1 Value","Variant Price","Variant Compare At Price","Image Src"',
    );
    expect(csv).toContain('"ProductRadar Import"');
    expect(csv).toContain('"13.49"'); // their copy, priced at 13.49
  });

  it("sends it to the wallet that bought it over x402, once per signed sign-in", async () => {
    const proof = await signIn();
    const res = await call(ASIN, { [HEADER_SIWX]: proof });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"12.99"'); // the wallet's own copy, priced at 12.99
    const replay = await call(ASIN, { [HEADER_SIWX]: proof });
    expect([replay.status, (await replay.json()).error]).toEqual([402, "invalid_siwx_nonce"]);
  });

  it("asks an anonymous caller to sign in: a 402 with the challenge for this exact URL and nothing to pay", async () => {
    const res = await call(ASIN);
    expect(res.status).toBe(402);
    const required = decode(res.headers.get(HEADER_REQUIRED));
    expect(required.accepts).toEqual([]);
    expect(required.extensions["sign-in-with-x"].info.uri).toBe(`${BASE}/${ASIN}/export/csv`);
  });

  it("refuses a wallet that didn't buy it, a proof made for another address, and a refunded or other account", async () => {
    const stranger = await call(ASIN, { [HEADER_SIWX]: await signIn(privateKeyToAccount(generatePrivateKey())) });
    expect([stranger.status, (await stranger.json()).error]).toEqual([402, "siwx_no_purchase"]);
    const elsewhere = await call("B0OTHERAA1", { [HEADER_SIWX]: await signIn(buyer, ASIN) });
    expect((await elsewhere.json()).error).toBe("invalid_siwx_uri_mismatch");
    for (const user of ["user_refunded", "user_never"]) {
      asUser(user);
      const res = await call(ASIN);
      expect([res.status, (await res.json()).error]).toEqual([403, "not_owned"]);
    }
  });

  it("has nothing to export when the Dossier's margin is withheld", async () => {
    asUser("user_thin");
    const res = await call("B0THINAAA1");
    expect([res.status, (await res.json()).error]).toEqual([409, "export_unavailable"]);
  });
});
