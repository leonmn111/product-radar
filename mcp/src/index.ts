// ProductRadar MCP server (stdio). Gives Claude Desktop, Cursor, Claude Code
// and any MCP-capable agent framework ProductRadar's product research as native
// tools. Paid tools settle automatically over x402 in USDC from the wallet in
// PRODUCTRADAR_WALLET_PRIVATE_KEY, within a per-call cap and a per-session budget.
//
// stdout carries the MCP protocol, so every log line goes to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ExactEvmScheme } from "@x402/evm";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };

function fail(message: string): never {
  console.error(`productradar-mcp: ${message}`);
  process.exit(1);
}

// ── Configuration ────────────────────────────────────────────────────────────

const API_URL = (process.env.PRODUCTRADAR_API_URL?.trim() || "https://theproductradar.io").replace(/\/+$/, "");
if (!/^https?:\/\//.test(API_URL)) fail("PRODUCTRADAR_API_URL must start with https://");

// Only USDC is ever paid: the session budget below relies on its 6 decimals.
const USDC: Record<string, { address: string; label: string }> = {
  "eip155:8453": { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", label: "Base" },
  "eip155:84532": { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", label: "Base Sepolia (testnet)" },
};

function usdcSetting(name: string, fallback: string): bigint {
  const raw = process.env[name]?.trim() || fallback;
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) fail(`${name} must be a USDC amount like ${fallback}`);
  const [whole, frac = ""] = raw.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"));
}
const formatUsdc = (atomic: bigint) => (Number(atomic) / 1e6).toFixed(6).replace(/\.?0+$/, "");

const MAX_PRICE = usdcSetting("PRODUCTRADAR_MAX_PRICE_USDC", "0.10");
const BUDGET = usdcSetting("PRODUCTRADAR_BUDGET_USDC", "1.00");

const key = process.env.PRODUCTRADAR_WALLET_PRIVATE_KEY?.trim();
if (key && !/^0x[0-9a-fA-F]{64}$/.test(key)) fail("PRODUCTRADAR_WALLET_PRIVATE_KEY must be 0x followed by 64 hex characters");
const account = key ? privateKeyToAccount(key as `0x${string}`) : null;

// ── Payments ─────────────────────────────────────────────────────────────────

let spent = 0n;
let pendingAmount = 0n;
const receipts: { at: string; tool: string; amountUsdc: string; network: string; transaction: string }[] = [];

const payFetch = account
  ? wrapFetchWithPayment(
      fetch,
      x402Client
        .fromConfig({
          schemes: Object.keys(USDC).map((network) => ({ network: network as `${string}:${string}`, client: new ExactEvmScheme(account) })),
          spendControls: { maxAmountPerPayment: `$${formatUsdc(MAX_PRICE)}` },
          policies: [(_v, reqs) => reqs.filter((r) => USDC[r.network]?.address.toLowerCase() === r.asset.toLowerCase())],
        })
        .onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
          const amount = BigInt(r.amount);
          if (amount > MAX_PRICE) {
            return { abort: true, reason: `the price (${formatUsdc(amount)} USDC) is above PRODUCTRADAR_MAX_PRICE_USDC (${formatUsdc(MAX_PRICE)})` };
          }
          if (spent + amount > BUDGET) {
            return {
              abort: true,
              reason: `this session's budget of ${formatUsdc(BUDGET)} USDC would be exceeded (${formatUsdc(spent)} spent). Restart the server or raise PRODUCTRADAR_BUDGET_USDC`,
            };
          }
          pendingAmount = amount;
        }),
    )
  : null;

const text = (t: string) => ({ type: "text" as const, text: t });
const toolError = (message: string): CallToolResult => ({ isError: true, content: [text(message)] });
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Price and network from a 402's PAYMENT-REQUIRED header, if readable. */
function challenge(res: Response): { price: string; network: string } | null {
  try {
    const r = JSON.parse(Buffer.from(res.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString("utf8")).accepts[0];
    return { price: `${formatUsdc(BigInt(r.amount))} USDC`, network: USDC[r.network]?.label ?? r.network };
  } catch {
    return null;
  }
}

async function callApi(tool: string, path: string): Promise<CallToolResult> {
  let res: Response;
  try {
    res = await (payFetch ?? fetch)(`${API_URL}${path}`, {
      headers: { Accept: "application/json", "User-Agent": `productradar-mcp/${pkg.version}` },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    const m = errorMessage(e);
    const blocked =
      m.match(/Payment creation aborted: (.*)$/)?.[1] ??
      (/maxAmountPerPayment/.test(m) ? `the price is above PRODUCTRADAR_MAX_PRICE_USDC (${formatUsdc(MAX_PRICE)} USDC)` : null);
    return toolError(blocked ? `Not paid: ${blocked}.` : `The request did not go through, and nothing was paid: ${m}`);
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (res.status === 402) {
    const c = challenge(res);
    if (!account) {
      return toolError(
        `This ProductRadar tool costs ${c ? `${c.price} on ${c.network}` : "a small USDC fee"} per call, paid automatically over x402, ` +
          `but no wallet is configured. Set PRODUCTRADAR_WALLET_PRIVATE_KEY in this MCP server's settings to a wallet holding a ` +
          `little USDC (setup: ${API_URL}/docs#mcp).`,
      );
    }
    const reason = String(body?.error ?? "unknown_reason");
    const empty = /insufficient|balance|funds/i.test(reason);
    return toolError(
      `The payment was not accepted (${reason}), so nothing was charged.` +
        (empty ? ` Add USDC to wallet ${account.address}${c ? ` on ${c.network}` : ""}.` : ""),
    );
  }
  if (!res.ok) {
    return toolError(`ProductRadar answered ${res.status}: ${String(body?.message ?? body?.error ?? res.statusText)}. Nothing was charged.`);
  }

  const content = [text(JSON.stringify(body, null, 2))];
  const receiptHeader = res.headers.get("PAYMENT-RESPONSE");
  if (receiptHeader) {
    const receipt = decodePaymentResponseHeader(receiptHeader);
    const amount = receipt.amount ? BigInt(receipt.amount) : pendingAmount;
    spent += amount;
    const network = USDC[receipt.network]?.label ?? receipt.network;
    receipts.push({ at: new Date().toISOString(), tool, amountUsdc: formatUsdc(amount), network, transaction: receipt.transaction });
    content.push(
      text(
        `Paid ${formatUsdc(amount)} USDC on ${network} (transaction ${receipt.transaction}). ` +
          `Session total: ${formatUsdc(spent)} of ${formatUsdc(BUDGET)} USDC.`,
      ),
    );
  }
  return { content };
}

// ── Tools ────────────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: "productradar", title: "ProductRadar", version: pkg.version },
  {
    instructions:
      "ProductRadar ranks e-commerce product opportunities using scores calculated from sourced, timestamped evidence. " +
      "Start with find_product_opportunities (search in plain words), then call get_product_dossier for the few products " +
      "worth a closer look. " +
      "Both are paid per call in USDC; get_payment_status is free. Scores, verdicts and margins are estimates, not guarantees: " +
      "cite the evidence sources when you report them. A margin's wholesale range is a US Census store-type average, " +
      "not a supplier quote; its two arbitrage ratings (reselling on eBay, or in your own shop at card fees) come only from " +
      "store prices ProductRadar captured.",
  },
);

const paid = { readOnlyHint: true, openWorldHint: true, idempotentHint: false } as const;

server.registerTool(
  "find_product_opportunities",
  {
    title: "Find product opportunities",
    description:
      "Search and rank e-commerce product opportunities. Describe what you want in plain words (query), optionally within a " +
      "category. Each result has an opportunity score (0–100, a calculated estimate) with a confidence (0–1), " +
      "quality/value/demand/sentiment/trend scores, the best current offer, the top cited evidence (source URL, timestamp, " +
      "quality score) and the query words it matched. Each also has margin insights: an estimated wholesale cost range and " +
      "gross margin spread (amount and %) from US Census retail benchmarks, and two arbitrage ratings (High Arbitrage / " +
      "Moderate / Retail Only) from real price gaps between stores: margin.arbitrage after eBay fees and " +
      "margin.arbitrageOwnStore after own-shop card fees, each with its sources. " +
      "Every response lists availableCategories. Pass a result's product.id " +
      "to get_product_dossier for the full picture. Paid: one x402 micro-payment in USDC per call.",
    inputSchema: {
      query: z
        .string()
        .max(200)
        .optional()
        .describe(
          'What to look for, in plain words, e.g. "wireless earbuds", "pizza oven" or "moisturizer". Matches product names, ' +
            "brands, categories and descriptions, ignoring case, plurals and British/American spelling; products matching " +
            "more of the words rank first. Omit to rank everything.",
        ),
      category: z
        .string()
        .max(100)
        .optional()
        .describe(
          "Optional category to narrow to, e.g. beauty, gadgets or tech-accessories. A value that isn't one of " +
            "availableCategories is searched for like query words instead.",
        ),
      limit: z.number().int().min(1).max(25).default(10).describe("How many products to return (1–25)."),
      includeSample: z.boolean().default(false).describe("Also include ProductRadar's demo products (marked isSample)."),
    },
    annotations: paid,
  },
  async ({ query, category, limit, includeSample }) => {
    const q = new URLSearchParams({ limit: String(limit), includeSample: String(includeSample) });
    if (query) q.set("q", query);
    if (category) q.set("category", category);
    return callApi("find_product_opportunities", `/api/agent/v1/opportunity?${q}`);
  },
);

server.registerTool(
  "get_product_dossier",
  {
    title: "Get product dossier",
    description:
      "The full Opportunity Dossier for one product: a rule-based verdict (High Potential / Moderate Risk / Crowded Market) " +
      "with its confidence, every score and the evidence it used, all observed offers, the margin insights (wholesale range, " +
      "gross margin spread, arbitrage ratings for eBay and for your own shop), a profit estimate from the observed " +
      "retail price (assumptions stated), supplier search keywords and links, a draft Shopify import CSV, and up to 50 cited " +
      "sources. Paid: one x402 micro-payment in USDC per call.",
    inputSchema: {
      productId: z.uuid().describe("A product.id returned by find_product_opportunities."),
    },
    annotations: paid,
  },
  async ({ productId }) => callApi("get_product_dossier", `/api/agent/v1/dossier?${new URLSearchParams({ productId })}`),
);

server.registerTool(
  "get_payment_status",
  {
    title: "Payment status",
    description:
      "Free. Shows the wallet this server pays from, the ProductRadar address it calls, the spending caps, and every payment made in this session.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => ({
    content: [
      text(
        JSON.stringify(
          {
            apiUrl: API_URL,
            wallet: account?.address ?? null,
            walletConfigured: Boolean(account),
            maxPricePerCallUsdc: formatUsdc(MAX_PRICE),
            sessionBudgetUsdc: formatUsdc(BUDGET),
            spentThisSessionUsdc: formatUsdc(spent),
            payments: receipts,
          },
          null,
          2,
        ),
      ),
    ],
  }),
);

await server.connect(new StdioServerTransport());
console.error(
  `productradar-mcp ${pkg.version} ready → ${API_URL} (` +
    (account ? `paying from ${account.address}, max ${formatUsdc(MAX_PRICE)} USDC/call, budget ${formatUsdc(BUDGET)} USDC` : "no wallet: paid tools will explain how to add one") +
    ")",
);
