import { describe, expect, it } from "vitest";
import { BulkJobCompleteAlert } from "./bulkJobCompleteAlert";
import { CreditPurchaseReceipt } from "./creditPurchaseReceipt";

describe("CreditPurchaseReceipt", () => {
  const r = CreditPurchaseReceipt({
    packName: "Growth Pack",
    credits: 55,
    amountPence: 2500,
    currency: "GBP",
    newBalance: 59,
    purchasedAt: new Date("2026-10-16T12:30:00Z"),
    reference: "cs_live_123",
    libraryUrl: "https://theproductradar.io/library",
  });

  it("states the pack, credits added, amount paid and new balance", () => {
    expect(r.subject).toBe("Receipt: Growth Pack, 55 credits (£25.00)");
    for (const s of ["Growth Pack", "+55", "£25.00", "59 credits", "2026-10-16 12:30 UTC", "cs_live_123"]) {
      expect(r.html).toContain(s);
      expect(r.text).toContain(s);
    }
    expect(r.html).toContain('href="https://theproductradar.io/library"');
  });

  it("is plain, email-safe HTML: no images, no scripts, no tracking", () => {
    expect(r.html).toMatch(/^<!doctype html>/);
    expect(r.html).not.toMatch(/<img|<script|<link/i);
  });
});

describe("BulkJobCompleteAlert", () => {
  it("states the job, rows processed and the refunds, with a link to the library", () => {
    const a = BulkJobCompleteAlert({ jobId: "01a1451c-85d4-70a3-8c84-89bc51b5804c", total: 100, done: 97, failed: 3, libraryUrl: "https://theproductradar.io/library" });
    expect(a.subject).toBe("Bulk job done: 97 of 100 scored");
    for (const s of ["01a1451c-85d4-70a3-8c84-89bc51b5804c", "100 of 100", "97", "their credits were returned"]) expect(a.text).toContain(s);
    expect(a.html).toContain('href="https://theproductradar.io/library"');
  });

  it("escapes what it's given", () => {
    const a = BulkJobCompleteAlert({ jobId: '<script>"x"</script>', total: 1, done: 1, failed: 0, libraryUrl: 'https://x.example/"onmouseover="' });
    expect(a.html).not.toContain("<script>");
    expect(a.html).toContain("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    expect(a.html).toContain('href="https://x.example/&quot;onmouseover=&quot;"');
  });
});
