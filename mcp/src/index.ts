// ProductRadar MCP server (stdio). Gives Claude Desktop, Cursor, Claude Code
// and any MCP-capable agent framework ProductRadar's 8-part product Dossiers as
// native tools, from the v2 agent API (/api/agent/v2). Paid tools settle
// automatically over x402 in USDC from the wallet in
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

// The defaults let one $2.00 Dossier through, and cap a session at $5.00.
const MAX_PRICE = usdcSetting("PRODUCTRADAR_MAX_PRICE_USDC", "2.00");
const BUDGET = usdcSetting("PRODUCTRADAR_BUDGET_USDC", "5.00");

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
    const said = String(body?.message ?? body?.error ?? res.statusText).replace(/\s*$/, "");
    return toolError(`ProductRadar answered ${res.status}: ${said}${/not (been )?charged|not asked to pay/i.test(said) ? "" : " Nothing was charged."}`);
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
      "ProductRadar builds an 8-part Dossier for an Amazon UK product: verdict, resellability, UK/EU landed margin, " +
      "momentum, saturation, supplier matches, evidence and exports. Start with search_products (plain words, $0.01) to " +
      "find the product most Amazon UK listings agree on; call get_product_dossier ($2.00) with an ASIN for one product. " +
      "Both are paid per call in USDC over x402; get_payment_status is free. The landed margin is calculated after VAT, " +
      "import duty, marketplace fees and advertising, from sourced supplier and retail prices: every number cites its " +
      "source in the evidence list, and a component that can't be sourced is left out and named, never guessed. Parts " +
      "below their confidence gate (0.5 for the verdict, 0.7 for every number) are withheld with what evidence is missing. " +
      "Scores, verdicts and margins are calculated estimates, not guarantees: cite the evidence when you report them.",
  },
);

const paid = { readOnlyHint: true, openWorldHint: true, idempotentHint: false } as const;
const DOSSIER_PARTS =
  "verdict (LAUNCH / TEST / AVOID, with its confidence), resellability flags, UK/EU landed margin (after VAT, duty, " +
  "fees and ads), momentum, saturation, up to 3 supplier matches, the evidence list (source URL, time, quality) and " +
  "exports (a Shopify import CSV link, once the parts it needs are shown)";

server.registerTool(
  "search_products",
  {
    title: "Search products",
    description:
      "Search Amazon UK in plain words and get the 8-part ProductRadar Dossier for the product most listings agree on " +
      "(synonyms are searched too when too few agree): " +
      DOSSIER_PARTS +
      ". Parts below their confidence gate are withheld, with what evidence is missing. Use product.identifiers.asin " +
      "with get_product_dossier for a specific product. Paid: one x402 micro-payment of 0.01 USDC per call; nothing is " +
      "charged when no listing matches or a source fails.",
    inputSchema: {
      query: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .describe('What to look for, in plain words, e.g. "ceramic coffee mug", "magnetic power bank" or "pet hair remover".'),
    },
    annotations: paid,
  },
  async ({ query }) => callApi("search_products", `/api/agent/v2/search?${new URLSearchParams({ q: query })}`),
);

server.registerTool(
  "get_product_dossier",
  {
    title: "Get product dossier",
    description:
      "The Standard 8-part ProductRadar Dossier for one Amazon UK product, by its ASIN: its product page (price, brand, " +
      "seller, category), other listings of it and supplier matches, giving " +
      DOSSIER_PARTS +
      ". Served from a 48-hour cache when a fresh copy exists. Paid: one x402 payment of 2.00 USDC per call.",
    inputSchema: {
      asin: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{10}$/, "a 10-character Amazon ASIN")
        .describe("The Amazon UK ASIN, e.g. B0CH33F5P2 (from an amazon.co.uk link, or product.identifiers.asin in a search result)."),
    },
    annotations: paid,
  },
  async ({ asin }) => callApi("get_product_dossier", `/api/agent/v2/dossier/${asin.toUpperCase()}`),
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
