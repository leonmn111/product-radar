// One place for the browser to call ProductRadar's API, returning typed results instead of throwing.
//
// Authentication: a signed-in person's session is an httpOnly cookie, which every same-origin request
// sends by itself (`credentials: "same-origin"`). There are no tokens for page code to hold or attach,
// and none should be: script can't read the cookie, so it can't leak. Stripe session ids aren't
// credentials (they only identify a finished checkout), so they never travel here.
//
// Who pays how: people pay in platform credits, through their session (everything here). Agents pay
// per request in USDC over x402 at /api/agent/v2/*, which this client doesn't call.
//   searchProducts()   POST /api/search: 1 credit, or one of Pro's 100 free searches a month
//   getDossier()       POST /api/dossier/{asin}: 4 credits, or 1 on Pro / Agency
//   uploadBulkAgency() POST /api/agency/bulk-upload: Agency, 1 credit per ASIN
//   getHistory()       GET /api/user/history: the user's Dossiers (free to reopen)

import type { Dossier } from "@/types/dossier";

export type ApiError = {
  ok: false;
  /** HTTP status; 0 when the request never got an answer (offline, blocked). */
  status: number;
  /** The server's error code, e.g. "insufficient_credits", or "network_error" / "bad_response". */
  error: string;
  /** A sentence to show the user. */
  message: string;
  /** Anything else the server sent with the error (e.g. `needed` and `balance` for credits). */
  details: Record<string, unknown>;
};
export type ApiResult<T> = { ok: true; data: T } | ApiError;

export type ClientOptions = {
  /** Defaults to the page's own origin (relative URLs). Set it when calling from elsewhere. */
  baseUrl?: string;
  signal?: AbortSignal;
  /** For tests. */
  fetchImpl?: typeof fetch;
};

export type DossierPurchase = { dossier: Dossier; creditsCharged: number; creditsRemaining: number; cache: "hit" | "miss" };
/** One product a search found: its best-placed Amazon UK listing, with the evidence it came from. */
export type ProductResult = {
  asin: string;
  title: string;
  url: string;
  image: string | null;
  price: { amount: number; currency: string };
  rating: number | null;
  ratingsTotal: number | null;
  recentSales: string | null;
  sponsored: boolean;
  sameProductListings: number;
  evidence: { provider: string; sourceUrl: string; observedAt: string; quality: number; claim: string };
};
export type SearchResults = {
  query: string;
  sample: boolean;
  results: ProductResult[];
  notes: string[];
  cost: { free: boolean; creditsCharged: number; creditsRemaining: number; freeSearchesLeft: number | null };
};
/** One Dossier in the user's library. */
export type LibraryEntry = {
  dossierId: string;
  asin: string;
  title: string;
  verdict: "LAUNCH" | "TEST" | "AVOID" | "WITHHELD";
  confidence: number | null;
  generatedAt: string | null;
  purchasedAt: string;
  creditsSpent: number;
  sample: boolean;
};

export type BulkUploadAccepted = {
  jobId: string;
  status: "PENDING" | "RUNNING" | "DONE";
  total: number;
  duplicatesIgnored: number;
  creditsCharged: number;
  balance: number;
  statusUrl: string;
};
export type BulkJobStatus = {
  jobId: string;
  status: "PENDING" | "RUNNING" | "DONE";
  total: number;
  counts: { pending: number; running: number; done: number; failed: number };
  createdAt: string;
  finishedAt: string | null;
  items: {
    position: number;
    asin: string;
    status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    error?: string;
    dossierId?: string;
    title?: string;
    verdict?: "LAUNCH" | "TEST" | "AVOID" | "WITHHELD";
    confidence?: number;
    shopifyCsvUrl?: string | null;
  }[];
};

const ASIN = /^[A-Z0-9]{10}$/;
const FALLBACK = "Something went wrong. Please try again.";

const fail = (status: number, error: string, message: string, details: Record<string, unknown> = {}): ApiError => ({ ok: false, status, error, message, details });

/** Enough of a Dossier's shape to trust it before handing it to the UI. */
export function isDossier(v: unknown): v is Dossier {
  const d = v as Partial<Dossier> | null;
  return (
    typeof d === "object" &&
    d !== null &&
    typeof d.id === "string" &&
    typeof d.product?.title === "string" &&
    ["shown", "withheld"].includes(d.verdict?.status as string) &&
    typeof d.resellability === "object" &&
    Array.isArray(d.evidence) &&
    Array.isArray(d.supplierMatches)
  );
}

/** One request: JSON in, the body out, every failure as an ApiError. */
async function request(path: string, init: RequestInit, opts: ClientOptions): Promise<{ res: Response; body: unknown } | ApiError> {
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl ?? ""}${path}`, { credentials: "same-origin", signal: opts.signal, ...init, headers: { Accept: "application/json", ...init.headers } });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return fail(0, "aborted", "The request was cancelled.");
    return fail(0, "network_error", "We couldn't reach ProductRadar. Check your connection and try again.");
  }
  const body: unknown = await res.json().catch(() => null);
  return { res, body };
}

/** A non-2xx answer as an ApiError, keeping the server's code, message and extra fields. */
function errorFrom(res: Response, body: unknown): ApiError {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { error, message, ...details } = b;
  return fail(res.status, typeof error === "string" ? error : `http_${res.status}`, typeof message === "string" ? message : FALLBACK, details);
}

const num = (v: string | null) => (v !== null && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * The Standard Dossier for one Amazon UK product, paid in the signed-in user's credits (4, or 1 on
 * Pro / Agency). Errors include "unauthenticated" (401), "insufficient_credits" (402, with `needed`
 * and `balance`), "no_product" (404) and "live_search_unavailable" (503); credits are returned
 * whenever a Dossier can't be built.
 */
export async function getDossier(asin: string, opts: ClientOptions = {}): Promise<ApiResult<DossierPurchase>> {
  const id = asin.trim().toUpperCase();
  if (!ASIN.test(id)) return fail(400, "invalid_asin", "An Amazon UK ASIN is 10 letters and numbers, e.g. B0CH33F5P2.");
  const r = await request(`/api/dossier/${id}`, { method: "POST" }, opts);
  if (!("res" in r)) return r;
  if (!r.res.ok) return errorFrom(r.res, r.body);
  if (!isDossier(r.body)) return fail(r.res.status, "bad_response", FALLBACK);
  return {
    ok: true,
    data: {
      dossier: r.body,
      creditsCharged: num(r.res.headers.get("x-credits-charged")) ?? 0,
      creditsRemaining: num(r.res.headers.get("x-credits-remaining")) ?? 0,
      cache: r.res.headers.get("x-dossier-cache") === "hit" ? "hit" : "miss",
    },
  };
}

/**
 * Amazon UK products for a search, for the signed-in user: 1 credit, or one of Pro's 100 free
 * searches this billing cycle (`cost` says which). A search that finds nothing is free. Errors include
 * "unauthenticated" (401), "insufficient_credits" (402, with `needed` and `balance`) and
 * "search_unavailable" (503).
 */
export async function searchProducts(query: string, opts: ClientOptions = {}): Promise<ApiResult<SearchResults>> {
  const q = query.trim();
  if (q.length < 2 || q.length > 120) return fail(400, "invalid_query", "Search for 2 to 120 characters.");
  const r = await request("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) }, opts);
  if (!("res" in r)) return r;
  if (!r.res.ok) return errorFrom(r.res, r.body);
  const b = r.body as Partial<SearchResults> | null;
  if (!Array.isArray(b?.results) || typeof b.cost !== "object") return fail(r.res.status, "bad_response", FALLBACK);
  return { ok: true, data: b as SearchResults };
}

/**
 * An Agency bulk upload: a CSV of up to 100 ASINs, 1 credit each, scored in the background. Errors
 * include "agency_required" (403), "insufficient_credits" (402: nothing is charged or queued) and
 * "invalid_rows" (400, with the rows in `details.invalid`). Poll getBulkJob() for progress.
 */
export async function uploadBulkAgency(csvFile: File | Blob, opts: ClientOptions = {}): Promise<ApiResult<BulkUploadAccepted>> {
  if (csvFile.size === 0) return fail(400, "empty_csv", "The file is empty.");
  if (csvFile.size > 64 * 1024) return fail(413, "too_large", "The file is over 64 KB.");
  const form = new FormData();
  form.set("file", csvFile, csvFile instanceof File ? csvFile.name : "products.csv");
  const r = await request("/api/agency/bulk-upload", { method: "POST", body: form }, opts);
  if (!("res" in r)) return r;
  if (r.res.status !== 202) return errorFrom(r.res, r.body);
  const b = r.body as Partial<BulkUploadAccepted> | null;
  if (typeof b?.jobId !== "string" || typeof b.total !== "number") return fail(r.res.status, "bad_response", FALLBACK);
  return { ok: true, data: b as BulkUploadAccepted };
}

/** A bulk job's progress and each finished item's verdict (owner only). */
export async function getBulkJob(jobId: string, opts: ClientOptions = {}): Promise<ApiResult<BulkJobStatus>> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return fail(404, "not_found", "No such bulk job.");
  const r = await request(`/api/agency/bulk-upload/${jobId}`, { method: "GET" }, opts);
  if (!("res" in r)) return r;
  if (!r.res.ok) return errorFrom(r.res, r.body);
  const b = r.body as Partial<BulkJobStatus> | null;
  if (typeof b?.jobId !== "string" || !Array.isArray(b.items)) return fail(r.res.status, "bad_response", FALLBACK);
  return { ok: true, data: b as BulkJobStatus };
}

/** The signed-in user's Dossiers, newest purchase first. Reopening one (/terminal?asin=…&id=…) is free. */
export async function getHistory(opts: ClientOptions = {}): Promise<ApiResult<LibraryEntry[]>> {
  const r = await request("/api/user/history", { method: "GET" }, opts);
  if (!("res" in r)) return r;
  if (!r.res.ok) return errorFrom(r.res, r.body);
  const items = (r.body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return fail(r.res.status, "bad_response", FALLBACK);
  return { ok: true, data: items as LibraryEntry[] };
}
