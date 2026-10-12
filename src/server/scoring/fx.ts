// Currency conversion for comparing prices only (which offer is cheapest, how a
// price sits against its category). Offers keep their original price and currency;
// nothing shown to users is converted. Rates are the European Central Bank's euro
// reference rates, stored with their date in fx-rates.json (npm run fx:update).

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** Units of each currency per 1 EUR, as published by the ECB on `date`. */
export type FxRates = { date: string; perEur: Record<string, number> };

/** An amount in euros, or null if the ECB doesn't publish a rate for the currency. */
export function toEur(amount: number, currency: string, fx: FxRates): number | null {
  if (currency === "EUR") return amount;
  const rate = fx.perEur[currency];
  return rate && rate > 0 ? amount / rate : null;
}

/** Pure: rates from the ECB daily reference-rates XML. Throws if it doesn't look right. */
export function parseEcbDaily(xml: string): FxRates {
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!date) throw new Error("ECB rates: no reference date found.");
  const perEur: Record<string, number> = {};
  for (const m of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g)) {
    const rate = Number(m[2]);
    if (Number.isFinite(rate) && rate > 0) perEur[m[1]] = rate;
  }
  // The ECB publishes about 30 currencies; far fewer means the feed changed shape.
  if (Object.keys(perEur).length < 20 || !perEur.USD || !perEur.GBP) {
    throw new Error(`ECB rates: expected ~30 currencies including USD and GBP, got ${Object.keys(perEur).length}.`);
  }
  return { date, perEur };
}
