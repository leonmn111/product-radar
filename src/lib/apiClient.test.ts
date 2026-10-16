import { describe, expect, it, vi } from "vitest";
import { getBulkJob, getDossier, isDossier, searchProducts, uploadBulkAgency } from "./apiClient";

const dossier = {
  id: "d1",
  generatedAt: "2026-10-16T12:00:00.000Z",
  product: { title: "Mug", query: "B0MUGAAAA1", market: "UK", country: "GB", currency: "GBP", identifiers: { asin: "B0MUGAAAA1" } },
  sample: false,
  notes: [],
  verdict: { status: "withheld", reason: "Insufficient Data", confidence: 0.3, missing: [] },
  resellability: {},
  landedMargin: { status: "withheld", reason: "Insufficient Data", confidence: 0.3, missing: [] },
  momentum: { status: "withheld", reason: "Insufficient Data", confidence: 0.3, missing: [] },
  saturation: { status: "withheld", reason: "Insufficient Data", confidence: 0.3, missing: [] },
  supplierMatches: [],
  evidence: [],
  exports: { shopifyCsvUrl: null, pdfUrl: null, shareLink: null },
};
/** A fake fetch that answers once, and remembers what it was asked. */
const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }),
  );

describe("getDossier", () => {
  it("POSTs to the credits route with the session cookie, and returns the Dossier with what it cost", async () => {
    const fetchImpl = answer(200, dossier, { "x-credits-charged": "4", "x-credits-remaining": "6", "x-dossier-cache": "hit" });
    const r = await getDossier(" b0mugaaaa1 ", { fetchImpl });
    expect(r).toEqual({ ok: true, data: { dossier, creditsCharged: 4, creditsRemaining: 6, cache: "hit" } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect([url, init?.method, init?.credentials]).toEqual(["/api/dossier/B0MUGAAAA1", "POST", "same-origin"]);
  });

  it("passes the server's error through, with its extra fields", async () => {
    const r = await getDossier("B0MUGAAAA1", { fetchImpl: answer(402, { error: "insufficient_credits", message: "A Standard Dossier costs 4 credits; you have 2.", needed: 4, balance: 2 }) });
    expect(r).toEqual({ ok: false, status: 402, error: "insufficient_credits", message: "A Standard Dossier costs 4 credits; you have 2.", details: { needed: 4, balance: 2 } });
  });

  it("checks the ASIN before calling, and never hands the UI something that isn't a Dossier", async () => {
    const fetchImpl = answer(200, { not: "a dossier" });
    expect((await getDossier("nope", { fetchImpl })).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await getDossier("B0MUGAAAA1", { fetchImpl })).toMatchObject({ ok: false, error: "bad_response" });
    expect(isDossier(dossier)).toBe(true);
    expect(isDossier(null)).toBe(false);
  });

  it("reports no connection, and a cancelled request, without throwing", async () => {
    const offline = vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")));
    expect(await getDossier("B0MUGAAAA1", { fetchImpl: offline })).toMatchObject({ ok: false, status: 0, error: "network_error" });
    const aborted = vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError")));
    expect(await getDossier("B0MUGAAAA1", { fetchImpl: aborted })).toMatchObject({ ok: false, error: "aborted" });
  });
});

describe("searchProducts", () => {
  const found = {
    query: "ceramic mug",
    sample: false,
    results: [{ asin: "B0MUGAAAA1", title: "Mug", url: "https://www.amazon.co.uk/dp/B0MUGAAAA1", image: null, price: { amount: 12.99, currency: "GBP" }, rating: 4.5, ratingsTotal: 10, recentSales: null, sponsored: false, sameProductListings: 2, evidence: { provider: "rainforest", sourceUrl: "https://www.amazon.co.uk/dp/B0MUGAAAA1", observedAt: "x", quality: 80, claim: "c" } }],
    notes: [],
    cost: { free: true, creditsCharged: 0, creditsRemaining: 3, freeSearchesLeft: 99 },
  };

  it("POSTs the query to the human search route, with the session cookie", async () => {
    const fetchImpl = answer(200, found);
    expect(await searchProducts(" ceramic mug ", { fetchImpl })).toEqual({ ok: true, data: found });
    const [url, init] = fetchImpl.mock.calls[0];
    expect([url, init?.method, init?.credentials, init?.body]).toEqual(["/api/search", "POST", "same-origin", JSON.stringify({ q: "ceramic mug" })]);
  });

  it("passes the credit gate's 402 through, and checks the query first", async () => {
    const r = await searchProducts("ceramic mug", { fetchImpl: answer(402, { error: "insufficient_credits", message: "A search costs 1 credit; you have 0.", needed: 1, balance: 0 }) });
    expect(r).toMatchObject({ ok: false, status: 402, error: "insufficient_credits", details: { needed: 1, balance: 0 } });
    const fetchImpl = answer(200, found);
    expect(await searchProducts("x", { fetchImpl })).toMatchObject({ ok: false, error: "invalid_query" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("uploadBulkAgency and getBulkJob", () => {
  it("uploads the CSV as a file and returns the accepted job", async () => {
    const accepted = { jobId: "01a1451c-85d4-70a3-8c84-89bc51b5804c", status: "PENDING", total: 2, duplicatesIgnored: 1, creditsCharged: 2, balance: 8, statusUrl: "/api/agency/bulk-upload/01a1451c-85d4-70a3-8c84-89bc51b5804c" };
    const fetchImpl = answer(202, accepted);
    const r = await uploadBulkAgency(new File(["asin\nB0MUGAAAA1\n"], "products.csv", { type: "text/csv" }), { fetchImpl });
    expect(r).toEqual({ ok: true, data: accepted });
    const body = fetchImpl.mock.calls[0][1]?.body as FormData;
    expect((body.get("file") as File).name).toBe("products.csv");
  });

  it("passes Agency-only and credit errors through, and refuses an empty file without calling", async () => {
    const r = await uploadBulkAgency(new File(["B0MUGAAAA1"], "a.csv"), { fetchImpl: answer(403, { error: "agency_required", message: "Bulk uploads are part of the Agency plan." }) });
    expect(r).toMatchObject({ ok: false, status: 403, error: "agency_required" });
    const fetchImpl = answer(202, {});
    expect(await uploadBulkAgency(new File([], "empty.csv"), { fetchImpl })).toMatchObject({ ok: false, error: "empty_csv" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads a job's progress", async () => {
    const job = { jobId: "01a1451c-85d4-70a3-8c84-89bc51b5804c", status: "DONE", total: 1, counts: { pending: 0, running: 0, done: 1, failed: 0 }, createdAt: "x", finishedAt: "y", items: [] };
    expect(await getBulkJob(job.jobId, { fetchImpl: answer(200, job) })).toEqual({ ok: true, data: job });
    expect(await getBulkJob("../../etc", { fetchImpl: answer(200, job) })).toMatchObject({ ok: false, error: "not_found" });
  });
});
