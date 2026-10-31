import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site", () => ({ SITE_URL: "https://theproductradar.io" }));
const { default: robots } = await import("./robots");
const { default: sitemap } = await import("./sitemap");

describe("search engine files", () => {
  it("lists only the public pages in the sitemap", () => {
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://theproductradar.io",
      "https://theproductradar.io/agencies",
      "https://theproductradar.io/tools/eu-duty-calculator",
      "https://theproductradar.io/docs",
      "https://theproductradar.io/terms",
      "https://theproductradar.io/privacy",
    ]);
  });

  it("lets crawlers in, keeps private pages out, and points to the sitemap", () => {
    const r = robots();
    const rule = [r.rules].flat()[0];
    expect(rule.allow).toEqual(["/", "/docs"]);
    for (const path of ["/api/", "/account", "/dashboard", "/signin", "/upgrade"]) expect(rule.disallow).toContain(path);
    expect(r.sitemap).toBe("https://theproductradar.io/sitemap.xml");
  });
});
