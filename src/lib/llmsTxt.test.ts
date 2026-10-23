import { describe, expect, it, vi } from "vitest";
import glama from "../../glama.json";
import mcpPackage from "../../mcp/package.json";

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://theproductradar.io" } }));
const { llmsTxt } = await import("./llmsTxt");
const { BAZAAR } = await import("@/server/payments/x402/discovery");

describe("/llms.txt", () => {
  const text = llmsTxt();

  it("follows the llms.txt shape: a title, a one-paragraph summary, then sections of links", () => {
    expect(text.startsWith("# ProductRadar\n\n> ")).toBe(true);
    expect(text).toMatch(/^## Agent API \(x402, USDC\)$/m);
    expect(text).toMatch(/^## MCP server$/m);
  });

  it("lists every paid endpoint at its real price, and the current MCP package", () => {
    for (const e of BAZAAR) expect(text).toContain(`\`${e.method} ${e.path.replace(":asin", "{asin}")}\`, ${e.priceUsdc} USDC.`);
    expect(text).toContain(`https://theproductradar.io/mcp/productradar-mcp-${mcpPackage.version}.tgz`);
    expect(text).toContain("https://theproductradar.io/api/agent/v2/bazaar");
  });

  it("describes the UK/EU landed margin, never benchmark figures", () => {
    expect(text).toContain("after VAT, import duty, marketplace fees and advertising");
    expect(text).not.toMatch(/census|wholesale range|\/api\/agent\/v1/i);
  });
});

describe("glama.json", () => {
  it("names its schema and a maintainer", () => {
    expect(glama).toEqual({ $schema: "https://glama.ai/mcp/schemas/server.json", maintainers: ["leonmn111"] });
  });
});
