import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RetailListing, SupplierOffer } from "@/server/live/types";
import { buildDossier } from "@/services/dossierService";
import type { Dossier } from "@/types/dossier";

vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-inter" }) }));
const { DossierTerminal } = await import("./DossierTerminal");

const NOW = new Date("2026-10-16T12:00:00Z");
const MUG = "Plain White Ceramic Coffee Mug 350ml";
const listing = (n: number): RetailListing => ({
  market: "GB",
  id: `B0MUG000${n}`,
  title: MUG,
  url: `https://www.amazon.co.uk/dp/B0MUG000${n}`,
  image: null,
  price: { amount: 12.99, currency: "GBP" },
  rating: null,
  ratingsTotal: null,
  sponsored: false,
  recentSales: null,
  evidence: { id: `rainforest:amazon.co.uk:B0MUG000${n}`, provider: "rainforest", sourceUrl: `https://www.amazon.co.uk/dp/B0MUG000${n}`, observedAt: NOW.toISOString(), quality: 90, claim: "Listed at £12.99" },
});
const offer = (n: number): SupplierOffer => ({
  id: `ae${n}`,
  title: "Ceramic Coffee Mug 350ml White Plain",
  url: `https://www.aliexpress.com/item/${n}.html`,
  image: null,
  unitPrice: { amount: 2.1, currency: "GBP" },
  shipping: null,
  shipsTo: "GB",
  evidence: { id: `aliexpress:${n}`, provider: "aliexpress", sourceUrl: `https://www.aliexpress.com/item/${n}.html`, observedAt: NOW.toISOString(), quality: 80, claim: "Offered at £2.10" },
});
const build = (listings: number, suppliers: number) =>
  buildDossier({ query: "mug", ukListings: Array.from({ length: listings }, (_, i) => listing(i + 1)), suppliers: Array.from({ length: suppliers }, (_, i) => offer(i + 1)) }, { id: "d1", now: NOW });
const html = (d: Dossier) => renderToStaticMarkup(createElement(DossierTerminal, { dossier: d }));

describe("DossierTerminal", () => {
  it("draws exactly 8 panels, one per part", () => {
    const out = html(build(4, 2));
    const panels = [...out.matchAll(/<h3 id="dossier-part-(\d)"[^>]*>.*?<\/span> ([^<]+)<\/h3>/g)].map((m) => [m[1], m[2]]);
    expect(panels).toEqual([
      ["1", "Verdict"],
      ["2", "Resellability"],
      ["3", "Landed margin"],
      ["4", "Momentum"],
      ["5", "Saturation"],
      ["6", "Supplier matches"],
      ["7", "Evidence"],
      ["8", "Exports"],
    ]);
  });

  it("with a verdict: shows it and every shown number, and no withheld warning", () => {
    const d = build(4, 2);
    expect(d.landedMargin.status).toBe("shown");
    const out = html(d);
    expect(out).toContain(">TEST<");
    expect(out).toContain("Net profit per unit");
    expect(out).toContain("£12.99");
    expect(out).not.toContain("VERDICT WITHHELD");
    expect(out).not.toContain('data-testid="margin-blurred"');
  });

  it("below 0.5: warns VERDICT WITHHELD, blurs the margin, and puts no margin figure on the page", () => {
    const d = build(1, 0);
    expect(d.verdict.status).toBe("withheld");
    const out = html(d);
    expect(out).toContain("VERDICT WITHHELD: Insufficient Market Evidence");
    expect(out).toContain('data-testid="margin-blurred"');
    expect(out).toMatch(/aria-hidden="true" class="[^"]*blur-sm/);
    expect(out).not.toContain("Net profit per unit");
    // The only money on the page is the one listing's own cited claim.
    expect(out.match(/£\d/g)).toEqual(["£1"]);
  });

  it("never draws margin figures while the verdict is withheld, even if a margin were present", () => {
    const shown = build(4, 2);
    const forced: Dossier = { ...shown, verdict: { status: "withheld", reason: "Insufficient Data", confidence: 0.4, missing: ["more listings"] } };
    const out = html(forced);
    expect(out).toContain("VERDICT WITHHELD");
    expect(out).not.toContain("Net profit per unit");
    expect(out).toContain('data-testid="margin-blurred"');
  });

  it("labels sample data", () => {
    expect(html({ ...build(1, 0), sample: true })).toContain("Sample data: not real");
  });
});
