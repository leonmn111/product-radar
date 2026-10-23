import { SITE_URL } from "@/lib/site";
import { BAZAAR } from "@/server/payments/x402/discovery";
import mcpPackage from "../../mcp/package.json";

// The text of /llms.txt: what ProductRadar is and how an agent uses it, for language models
// (llmstxt.org). Built from the paid endpoints (BAZAAR) and the MCP package, so it can't drift from them.

const EXAMPLES: Record<string, { name: string; url: string }> = {
  "/api/agent/v2/search": { name: "Search", url: `${SITE_URL}/api/agent/v2/search?q=ceramic+coffee+mug` },
  "/api/agent/v2/dossier/:asin": { name: "Standard Dossier", url: `${SITE_URL}/api/agent/v2/dossier/B0CH33F5P2` },
};

export function llmsTxt(): string {
  const tarball = `${SITE_URL}/mcp/productradar-mcp-${mcpPackage.version}.tgz`;
  const endpoints = BAZAAR.map((e) => {
    const example = EXAMPLES[e.path];
    const route = `\`${e.method} ${e.path.replace(":asin", "{asin}")}\``;
    return `- ${example ? `[${example.name}](${example.url}): ${route}` : route}, ${e.priceUsdc} USDC. ${e.description}.`;
  });
  return `# ProductRadar

> Product research for UK and EU sellers. ProductRadar builds an 8-part Dossier for an Amazon UK product: verdict, resellability, landed margin, momentum, saturation, supplier matches, evidence and exports. The landed margin is calculated after VAT, import duty, marketplace fees and advertising, from live Amazon UK and AliExpress prices: every number cites its source, and a part below its confidence gate is withheld, never estimated.

- A verdict (LAUNCH, TEST or AVOID) is shown at 0.5 confidence or more; every number (margins, momentum, saturation, scores) needs 0.7.
- Scores, verdicts and margins are calculated estimates, not guarantees.
- Branded and brand-restricted products are flagged as not sellable and get no margin.
- AI agents pay per request in USDC over x402 (HTTP 402): no account or API key.

## Agent API (x402, USDC)

${endpoints.join("\n")}
- \`GET /api/agent/v2/dossier/{asin}/export/csv\`: a bought Dossier as a Shopify product import file, free for its buyer (Sign-In-With-X).
- [x402 Bazaar manifest](${SITE_URL}/api/agent/v2/bazaar): every paid endpoint with its price and its input and output schemas, as JSON.

A request without payment is answered with HTTP 402 and the price in the PAYMENT-REQUIRED header; any x402 v2 client pays and retries. Nothing is charged when a search finds no listing or a data source fails.

## MCP server

- [productradar-mcp ${mcpPackage.version}](${tarball}): a stdio MCP server for Claude, Cursor and agent frameworks. Run \`npx -y ${tarball}\` with PRODUCTRADAR_WALLET_PRIVATE_KEY set to a wallet holding a little USDC. Tools: search_products, get_product_dossier (both paid per call) and get_payment_status (free).
- [Install guide](${SITE_URL}/docs#mcp): Claude Desktop, Cursor, Claude Code and the spending caps.

## Legal

- [Terms](${SITE_URL}/terms)
- [Privacy](${SITE_URL}/privacy)
`;
}
