import { describe, expect, it } from "vitest";
import { highestRrp, type RrpOffer } from "./rrp";

const asOf = new Date("2026-10-14T12:00:00.000Z");
const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86_400_000);
const offer = (url: string, rrp: number | null, over: Partial<RrpOffer> = {}): RrpOffer => ({
  url,
  merchant: new URL(url).hostname,
  currency: "GBP",
  observedAt: daysAgo(1),
  rrp,
  rrpEvidenceId: rrp === null ? null : `e-${url}`,
  ...over,
});

describe("highestRrp", () => {
  it("picks the highest RRP across stores, with where and when it was seen", () => {
    expect(highestRrp([offer("https://a.test/x", 20), offer("https://b.test/x", 24), offer("https://c.test/x", null)], "GBP", asOf)).toEqual({
      amount: "24.00",
      currency: "GBP",
      merchant: "b.test",
      url: "https://b.test/x",
      observedAt: daysAgo(1).toISOString(),
      evidenceId: "e-https://b.test/x",
    });
  });

  it("uses each store page's newest capture only", () => {
    // b.test published an RRP of £30 last week but no longer does.
    const offers = [offer("https://a.test/x", 20), offer("https://b.test/x", 30, { observedAt: daysAgo(7) }), offer("https://b.test/x", null)];
    expect(highestRrp(offers, "GBP", asOf)?.amount).toBe("20.00");
  });

  it("ignores stale captures, other currencies, and products without a price", () => {
    expect(highestRrp([offer("https://a.test/x", 20, { observedAt: daysAgo(45) })], "GBP", asOf)).toBeNull();
    expect(highestRrp([offer("https://a.test/x", 20, { currency: "USD" })], "GBP", asOf)).toBeNull();
    expect(highestRrp([offer("https://a.test/x", 20)], null, asOf)).toBeNull();
  });
});
