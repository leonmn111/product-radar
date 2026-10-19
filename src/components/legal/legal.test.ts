import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/site", () => ({ SITE_URL: "https://theproductradar.io" }));
vi.mock("@/components/app-header", () => ({ AppHeader: () => null }));
const { Footer } = await import("@/components/Footer");
const { Detail, ContactEmail } = await import("./LegalPage");
const { LEGAL, legalDetailsComplete } = await import("@/lib/legal");

describe("Footer", () => {
  it("links the Terms and the Privacy Policy, quietly", () => {
    const html = renderToStaticMarkup(createElement(Footer));
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toMatch(/<nav aria-label="Legal and help"/);
    expect(html).toContain("calculated estimates from cited evidence, not guarantees");
  });
});

describe("legal details", () => {
  it("shows a marked placeholder until a required detail is filled in, then the detail", () => {
    expect(renderToStaticMarkup(createElement(Detail, { value: null, missing: "postal address" }))).toContain("[to be added: postal address]");
    expect(renderToStaticMarkup(createElement(Detail, { value: "1 High Street, London", missing: "postal address" }))).toBe("1 High Street, London");
  });

  it("knows whether the pages are ready for review", () => {
    const saved = { ...LEGAL };
    Object.assign(LEGAL, { operator: null, contactEmail: null, postalAddress: null });
    expect(legalDetailsComplete()).toBe(false);
    expect(renderToStaticMarkup(createElement(ContactEmail))).toContain("[to be added: contact email]");
    Object.assign(LEGAL, { operator: "Jane Smith, trading as ProductRadar", contactEmail: "hello@example.com", postalAddress: "1 High Street, London" });
    expect(legalDetailsComplete()).toBe(true);
    expect(renderToStaticMarkup(createElement(ContactEmail))).toContain('href="mailto:hello@example.com"');
    Object.assign(LEGAL, saved);
  });
});
