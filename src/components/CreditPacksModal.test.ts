import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-inter" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const { CreditPacksModal } = await import("./CreditPacksModal");
const { DossierRunner } = await import("./DossierRunner");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
const modal = (over: Partial<Parameters<typeof CreditPacksModal>[0]> = {}) =>
  renderToStaticMarkup(createElement(CreditPacksModal, { open: true, onClose: () => {}, onSale: true, balance: 2, ...over }));

describe("CreditPacksModal", () => {
  it("shows the three packs with their price, credits, price per credit and bonus", () => {
    const t = text(modal());
    expect(t).toMatch(/Starter Pack 20 credits £10 · £0\.50 a credit Buy for £10/);
    expect(t).toMatch(/Growth Pack 55 credits £25 · £0\.45 a credit 5 bonus credits Buy for £25/);
    expect(t).toMatch(/Best value Scale Pack 120 credits £50 · £0\.42 a credit 20 bonus credits Buy for £50/);
    expect(t).toContain("You have 2 credits.");
  });

  it("is a labelled dialog, and says why it opened", () => {
    const html = modal({ reason: "A Standard Dossier costs 4 credits; you have 2." });
    expect(html).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"/);
    expect(text(html)).toContain("A Standard Dossier costs 4 credits; you have 2.");
  });

  it("can't be used to buy before packs are on sale, and says so", () => {
    const off = modal({ onSale: false });
    expect(off.match(/<button[^>]*disabled=""[^>]*aria-busy="false"/g)).toHaveLength(3);
    expect(text(off)).toContain("Credit packs go on sale soon. Nothing has been charged.");
    expect(modal().match(/<button[^>]*disabled=""[^>]*aria-busy/g)).toBeNull();
  });
});

describe("DossierRunner", () => {
  const runner = (over: Partial<Parameters<typeof DossierRunner>[0]> = {}) =>
    renderToStaticMarkup(createElement(DossierRunner, { balance: 10, cost: 4, onSale: true, ...over }));

  it("shows what a Dossier costs this user", () => {
    expect(text(runner())).toContain("Run Dossier · 4 credits");
    expect(text(runner({ cost: 1 }))).toContain("Run Dossier · 1 credit");
  });

  it("shows a reopened Dossier at once, saying it was free", async () => {
    const { buildDossier } = await import("@/services/dossierService");
    const now = new Date("2026-10-16T12:00:00Z");
    const listing = { market: "GB" as const, id: "B0MUGAAAA1", title: "Mug", url: "https://www.amazon.co.uk/dp/B0MUGAAAA1", image: null, price: { amount: 9.99, currency: "GBP" }, rating: null, ratingsTotal: null, sponsored: false, recentSales: null, evidence: { id: "e", provider: "rainforest", sourceUrl: "https://www.amazon.co.uk/dp/B0MUGAAAA1", observedAt: now.toISOString(), quality: 80, claim: "c" } };
    const reopened = buildDossier({ query: "B0MUGAAAA1", ukListings: [listing], suppliers: [] }, { id: "d1", now });
    const t = text(runner({ reopened }));
    expect(t).toContain("Reopened from your library: the copy you bought on 2026-10-16. No credits used.");
    expect(t).toContain("VERDICT WITHHELD");
  });

  it("explains, and can't be run, while live Dossiers are off", () => {
    const html = runner({ unavailable: "Live Dossiers switch on soon." });
    expect(text(html)).toContain("Live Dossiers switch on soon.");
    expect(html).toMatch(/<button type="submit" disabled=""/);
  });
});
