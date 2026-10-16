// Keepa API response types, as Keepa documents them (keepa.com/api-docs: Making Requests, Product
// Request, Product Object; and Keepa's own Java client, keepacom/api_backend: Product.java,
// AmazonLocale.java, KeepaTime.java). Checked 2026-10-16. Only the fields this adapter reads, plus
// the response wrapper, are typed; Keepa sends many more.

/** Keepa's Amazon locale ids. NB: 2 is amazon.co.uk; 3 is amazon.de. */
export const KEEPA_DOMAIN = { US: 1, GB: 2, DE: 3, FR: 4, JP: 5, CA: 6, IT: 8, ES: 9, IN: 10, MX: 11, BR: 12 } as const;
export type KeepaDomainId = (typeof KEEPA_DOMAIN)[keyof typeof KEEPA_DOMAIN];

/** Indices into Product.csv (CsvType). Each history is a flat array: time, value, time, value, … */
export const CSV_TYPE = {
  AMAZON: 0,
  NEW: 1, // lowest new price from any seller, in the smallest currency unit (pence); -1 = no offer
  USED: 2,
  SALES: 3, // sales rank (best-sellers rank in the main category); -1 = no rank
  LISTPRICE: 4,
  BUY_BOX_SHIPPING: 18, // time, price, shipping (triples)
} as const;

/** Keepa Time: minutes since 2011-01-01 00:00 UTC. Unix ms = (keepaMinute + 21564000) × 60000. */
export const KEEPA_START_MINUTE = 21_564_000;
export const keepaMinuteToDate = (minute: number) => new Date((minute + KEEPA_START_MINUTE) * 60_000);

/** Product.productType: must be read first; 0 (STANDARD) means everything is accessible. */
export type KeepaProductType = 0 | 1 | 2 | 3 | 4 | 5;

export interface KeepaProduct {
  productType: KeepaProductType;
  asin: string;
  domainId: KeepaDomainId;
  title: string | null;
  trackingSince: number; // Keepa Time minutes
  lastUpdate: number; // Keepa Time minutes
  lastPriceChange?: number; // Keepa Time minutes
  rootCategory?: number;
  categories?: number[] | null;
  parentAsin?: string | null;
  salesRankReference?: number; // category node id of the main sales rank; -1 not available, -2 launchpad
  salesRanks?: Record<string, number[]> | null; // categoryId → time, rank, time, rank, …
  csv: (number[] | null)[] | null; // indexed by CSV_TYPE; null where Keepa has no history of that type
}

export interface KeepaError {
  type: string;
  message: string;
  details: string;
}

/** GET https://api.keepa.com/product?key=…&domain=…&asin=… */
export interface KeepaProductResponse {
  timestamp?: number; // ms
  tokensLeft: number;
  refillIn: number; // ms until the token bucket refills
  refillRate: number; // tokens per minute
  tokenFlowReduction: number;
  tokensConsumed: number;
  processingTimeInMs: number;
  products?: KeepaProduct[] | null;
  error?: KeepaError; // only set if an error occurred
}
