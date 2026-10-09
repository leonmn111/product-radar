import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { env } from "@/lib/env";
import { agentPaymentStatus } from "@/server/payments/x402/config";
import { encodeHeader, paymentRequiredBody } from "@/server/payments/x402/protocol";
import mcpPackage from "../../../mcp/package.json";
import { CodeBlock } from "./code-block";

// Public developer docs for the paid agent API and the MCP server. Always dark.
// The price, network and 402 example come from the live payment config, so the
// page never promises terms the API doesn't actually offer.

const SITE = (env.APP_URL ?? "https://theproductradar.io").replace(/\/+$/, "");
const MCP_TARBALL = `${SITE}/mcp/productradar-mcp-${mcpPackage.version}.tgz`;

const TITLE = "Agent API & MCP docs | ProductRadar";
const DESCRIPTION =
  "Query ProductRadar's evidence-backed product opportunities from AI agents. Pay per request in USDC with x402: no account, no API key. cURL examples, a TypeScript client and an MCP server for Claude and Cursor.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/docs` },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "ProductRadar", title: TITLE, description: DESCRIPTION, url: `${SITE}/docs` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const NAV = [
  ["quickstart", "Quickstart"],
  ["automatic-payments", "Automatic payments"],
  ["endpoints", "Endpoints"],
  ["mcp", "MCP server"],
  ["errors", "Errors"],
  ["guarantees", "What you can rely on"],
] as const;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400";
const link = `font-medium text-indigo-300 underline decoration-indigo-300/40 underline-offset-2 hover:decoration-indigo-300 ${focusRing}`;

function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-100 [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-5 border-t border-zinc-800 pt-10">
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-3 text-base font-semibold text-white">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-indigo-500/15 text-sm text-indigo-300 ring-1 ring-indigo-400/30"
        >
          {n}
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/** A table on wider screens; one labelled card per row on phones. */
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <>
      <div className="space-y-3 sm:hidden">
        {rows.map(([first, ...rest], i) => (
          <dl key={i} className="space-y-2 rounded-xl border border-zinc-800 p-4 text-sm">
            <div className="font-medium text-white">{first}</div>
            {rest.map((cell, j) => (
              <div key={j}>
                <dt className="text-xs uppercase tracking-wide text-zinc-400">{head[j + 1]}</dt>
                <dd className="mt-0.5 text-zinc-300">{cell}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <WideTable head={head} rows={rows} />
    </>
  );
}

function WideTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-zinc-800 sm:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((cells, i) => (
            <tr key={i} className="align-top">
              {cells.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-zinc-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

// Real responses from ProductRadar (a live product page ingested on 2026-10-08), shortened.
const OPPORTUNITY_EXAMPLE = json({
  generatedAt: "2026-10-09T01:23:21.102Z",
  methodologyVersion: "1.1.0",
  disclaimer:
    "opportunityScore is a calculated estimate (0–100) with a confidence (0–1), derived only from the cited evidence. It is not a guarantee.",
  query: { category: "earplugs", limit: 1, includeSample: false },
  count: 1,
  opportunities: [
    {
      rank: 1,
      product: {
        id: "01a11b1e-f44e-740a-8b84-0a08f4befa7d",
        name: "Loop Quiet™ 2",
        brand: "Loop Earplugs",
        category: "earplugs",
        isSample: false,
      },
      opportunityScore: { value: 64.23, confidence: 0.157, calculatedAt: "2026-10-08T11:03:34.831Z" },
      dimensions: {
        value: { value: 70.17, confidence: 0.16 },
        quality: { value: 61.03, confidence: 0.213 },
        demand: { value: 62.39, confidence: 0.213 },
      },
      bestOffer: {
        merchant: "loopearplugs.com",
        url: "https://www.loopearplugs.com/products/quiet",
        price: { amount: "19.95", currency: "EUR" },
        availability: "IN_STOCK",
        observedAt: "2026-10-08T10:46:15.722Z",
      },
      evidence: {
        count: 8,
        oldestObservedAt: "2026-10-08T10:46:15.722Z",
        newestObservedAt: "2026-10-08T10:46:18.884Z",
        top: [
          {
            claim: "Average rating 4.2 / 5 on loopearplugs.com",
            sourceUrl: "https://www.loopearplugs.com/products/quiet",
            sourceName: "loopearplugs.com",
            sourceType: "RETAILER",
            observedAt: "2026-10-08T10:46:18.884Z",
            qualityScore: 60,
            metric: { type: "RATING", value: 4.2 },
          },
          "… up to 5 per product",
        ],
      },
    },
  ],
});

const DOSSIER_EXAMPLE = json({
  generatedAt: "2026-10-09T01:23:21.129Z",
  methodologyVersion: "1.1.0",
  disclaimer:
    "Scores, the verdict and the profit figures are rule-based estimates calculated only from the cited evidence. They are not guarantees.",
  product: {
    id: "01a11b1e-f44e-740a-8b84-0a08f4befa7d",
    name: "Loop Quiet™ 2",
    brand: "Loop Earplugs",
    category: "earplugs",
    isSample: false,
    "…": "…",
  },
  verdict: {
    kind: "MODERATE_RISK",
    label: "Moderate Risk",
    summary:
      "Buyers rate it 4.2/5 (1 source) and it has about 14,000 reviews. We only have limited evidence so far (16% confidence), so treat this as an early read rather than a green light.",
    confidence: 0.157,
    confidenceLevel: "low",
    sourceCount: 3,
    method: "rule-based",
  },
  scores: {
    overall: {
      value: 64.23,
      confidence: 0.157,
      confidenceLevel: "low",
      calculatedAt: "2026-10-08T11:03:34.831Z",
      methodologyVersion: "1.1.0",
      evidenceIds: ["01a11b1e-f453-7037-b272-0558155253db", "…"],
    },
    "…": "value, quality, demand, sentiment, trend",
  },
  profitEstimate: {
    currency: "EUR",
    retailPrice: 19.95,
    retailPriceSource: {
      merchant: "loopearplugs.com",
      url: "https://www.loopearplugs.com/products/quiet",
      observedAt: "2026-10-08T10:46:15.722Z",
    },
    assumedWholesaleCost: 5.99,
    netProfitPerUnit: 13.96,
    marginPct: 70,
    assumptions: [
      "Wholesale cost assumed at 30% of the retail price: replace it with a real supplier quote.",
      "Advertising, shipping, platform fees and taxes are not included.",
    ],
  },
  sourcing: {
    keywords: "Quiet 2 earplugs",
    searchUrls: {
      aliexpress: "https://www.aliexpress.com/wholesale?SearchText=Quiet+2+earplugs",
      alibaba: "https://www.alibaba.com/trade/search?SearchText=Quiet+2+earplugs",
    },
    note: "Search links only: ProductRadar has not vetted any supplier.",
  },
  shopifyImportCsv: '"Title","URL handle","Description",… (one draft product)',
  bestOffer: "{ … }",
  offers: ["…"],
  evidence: {
    count: 8,
    included: 8,
    items: [
      {
        id: "01a11b1f-0063-7372-abd0-1f29587a430d",
        claim: 'Product listing: "Loop Quiet™ 2"',
        sourceUrl: "https://www.loopearplugs.com/products/quiet",
        sourceName: "loopearplugs.com",
        sourceType: "RETAILER",
        observedAt: "2026-10-08T10:46:18.884Z",
        publishedAt: null,
        qualityScore: 80,
        metric: null,
      },
      "…",
    ],
  },
});

export default function DocsPage() {
  return (
    <div className="flex-1 bg-zinc-950 text-zinc-300 [color-scheme:dark]">
      {/* Keeps overscroll and the area below short pages dark too. */}
      <style>{"body{background:#09090b}"}</style>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-indigo-500 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 text-sm whitespace-nowrap">
            <Link href="/" className={`rounded font-semibold tracking-tight text-indigo-300 ${focusRing}`}>
              ProductRadar
            </Link>
            <span aria-hidden className="text-zinc-600">
              /
            </span>
            <span className="text-zinc-300">
              <span className="hidden sm:inline">Agent API </span>Docs
            </span>
          </div>
          <Link
            href="/"
            className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-800 ${focusRing}`}
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 lg:px-8">
        <nav aria-label="On this page" className="pt-8 lg:sticky lg:top-0 lg:max-h-screen lg:self-start lg:pt-12">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">On this page</p>
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={`block rounded-md px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-900 hover:text-white lg:ring-0 ${focusRing}`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Suspense fallback={<DocsMainFallback />}>
          <DocsMain />
        </Suspense>
      </div>
    </div>
  );
}

function DocsMainFallback() {
  return (
    <main id="main" aria-busy="true" className="min-w-0 max-w-3xl space-y-6 pb-24 pt-10 lg:pt-12">
      <div className="h-4 w-48 animate-pulse rounded bg-zinc-900" />
      <div className="h-20 animate-pulse rounded-lg bg-zinc-900" />
      <div className="h-24 animate-pulse rounded-lg bg-zinc-900" />
      <div className="h-16 animate-pulse rounded-xl bg-zinc-900" />
    </main>
  );
}

async function DocsMain() {
  // Read per request, not at build time: the terms shown always match what the API charges right now.
  await connection();
  const status = agentPaymentStatus();
  const req = status.requirements;
  const exampleUrl = `${SITE}/api/agent/v1/opportunity?category=earplugs&limit=5`;
  const challenge = paymentRequiredBody(
    {
      url: exampleUrl,
      description: "ProductRadar ranked product opportunities with evidence-backed scores",
      mimeType: "application/json",
      serviceName: "ProductRadar",
    },
    req,
  );
  const challengeHeader = encodeHeader(challenge);
  const chainId = req.network.split(":")[1];

  const mcpConfig = json({
    mcpServers: {
      productradar: {
        command: "npx",
        args: ["-y", MCP_TARBALL],
        env: { PRODUCTRADAR_WALLET_PRIVATE_KEY: "0xYOUR_AGENT_WALLET_KEY", PRODUCTRADAR_BUDGET_USDC: "1.00" },
      },
    },
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "ProductRadar Agent API",
    description: DESCRIPTION,
    documentation: `${SITE}/docs`,
    provider: { "@type": "Organization", name: "ProductRadar", url: SITE },
    offers: { "@type": "Offer", price: status.priceUsdc, priceCurrency: "USDC" },
  };

  return (
    <main id="main" className="min-w-0 max-w-3xl space-y-12 pb-24 pt-10 lg:pt-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="space-y-6">
        <p className="text-sm font-medium text-indigo-300">For developers and AI agents</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Product research your agent can buy by the request
        </h1>
        <p className="text-lg leading-relaxed text-zinc-300">
          Ranked product opportunities and full Opportunity Dossiers, with every score calculated from sourced,
          timestamped evidence. No account and no API key: your agent pays a small fee in USDC per request using the{" "}
          <a href="https://x402.org" className={link}>
            x402 protocol
          </a>
          , and gets the data in the same HTTP exchange.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="#quickstart"
            className={`rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 ${focusRing}`}
          >
            Make your first request
          </a>
          <a
            href="#mcp"
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-100 ring-1 ring-zinc-700 hover:bg-zinc-900 ${focusRing}`}
          >
            Add to Claude or Cursor
          </a>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-3">
          <div className="bg-zinc-950 p-4">
            <dt className="text-xs uppercase tracking-wide text-zinc-400">Price</dt>
            <dd className="mt-1 font-semibold text-white">{status.priceUsdc} USDC per request</dd>
          </div>
          <div className="bg-zinc-950 p-4">
            <dt className="text-xs uppercase tracking-wide text-zinc-400">Network</dt>
            <dd className="mt-1 font-semibold text-white">
              {status.networkLabel}
              {status.testnet && <span className="font-normal text-zinc-400"> (testnet)</span>}
            </dd>
          </div>
          <div className="bg-zinc-950 p-4">
            <dt className="text-xs uppercase tracking-wide text-zinc-400">Status</dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold text-white">
              <span
                aria-hidden
                className={`size-2 rounded-full ${status.enabled ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              {status.mock ? "Local mock mode" : status.enabled ? "Accepting payments" : "Not switched on yet"}
            </dd>
          </div>
        </dl>
        {!status.enabled && (
          <p className="rounded-lg bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-400/30">
            Agent payments aren&apos;t switched on for this server yet, so the endpoints answer{" "}
            <C>503 payments_unavailable</C> for now. Everything below describes exactly how they behave once they are.
          </p>
        )}
        {status.enabled && status.testnet && (
          <p className="rounded-lg bg-zinc-900 px-4 py-3 text-sm text-zinc-300 ring-1 ring-zinc-800">
            Payments currently run on the Base Sepolia test network, using test USDC that has no cash value. Get some
            free from{" "}
            <a href="https://faucet.circle.com" className={link}>
              Circle&apos;s faucet
            </a>{" "}
            to try everything end to end. Your wallet needs USDC only, not ETH: the payment is a signature, and the
            facilitator pays the network fee.
          </p>
        )}
      </div>

      <Section id="quickstart" title="Quickstart with cURL">
        <p>
          Every paid endpoint follows the same three-step exchange. Ask without paying, read the price from the{" "}
          <C>402 Payment Required</C> answer, then repeat the request with a signed payment attached.
        </p>

        <Step n={1} title="Ask without paying">
          <CodeBlock title="Request" code={`curl -i "${exampleUrl}"`} />
          <CodeBlock
            title="Response (abridged)"
            copy={false}
            code={`HTTP/2 402\ncontent-type: application/json\ncache-control: no-store\npayment-required: ${challengeHeader.slice(0, 56)}…\n\n${json(challenge)}`}
          />
          <p>
            The same challenge is in the body and, base64-encoded, in the <C>PAYMENT-REQUIRED</C> header (x402 v2). Read
            it straight from the header:
          </p>
          <CodeBlock
            title="Decode the PAYMENT-REQUIRED header"
            code={`curl -s -D - -o /dev/null "${exampleUrl}" \\\n  | grep -i '^payment-required:' | cut -d' ' -f2 | tr -d '\\r' \\\n  | base64 --decode | jq .`}
          />
          <p>
            <C>amount</C> is in USDC&apos;s smallest unit (6 decimals), so <C>{req.amount}</C> is {status.priceUsdc}{" "}
            USDC. <C>asset</C> is the USDC contract on <C>{req.network}</C> ({status.networkLabel}), and <C>payTo</C> is
            where the payment goes.
          </p>
        </Step>

        <Step n={2} title="Sign a USDC payment authorization">
          <p>
            With the wallet that pays, sign an EIP-3009 <C>TransferWithAuthorization</C> (EIP-712 typed data) for
            exactly <C>amount</C> to <C>payTo</C>. Use the domain{" "}
            <C>{`{ name: "${req.extra.name}", version: "${req.extra.version}", chainId: ${chainId}, verifyingContract: asset }`}</C>
            , a random 32-byte <C>nonce</C>, and a <C>validBefore</C> no more than {req.maxTimeoutSeconds} seconds
            ahead. Then base64-encode this JSON:
          </p>
          <CodeBlock
            title="PAYMENT-SIGNATURE payload (before base64)"
            code={json({
              x402Version: 2,
              resource: { url: exampleUrl },
              accepted: "<the entry you chose from accepts[], unchanged>",
              payload: {
                signature: "0x<EIP-712 signature>",
                authorization: {
                  from: "0x<your wallet>",
                  to: req.payTo,
                  value: req.amount,
                  validAfter: "0",
                  validBefore: "<unix time, now + 120>",
                  nonce: "0x<32 random bytes>",
                },
              },
            })}
          />
          <p>
            You never send a private key or move funds yourself. The signature only allows this one transfer, of this
            amount, to this address, before it expires, and it can be used only once.
          </p>
        </Step>

        <Step n={3} title="Repeat the request with the payment">
          <CodeBlock title="Request" code={`curl -i "${exampleUrl}" \\\n  -H "PAYMENT-SIGNATURE: $PAYMENT"`} />
          <CodeBlock
            title="Response (abridged)"
            copy={false}
            code={`HTTP/2 200\ncontent-type: application/json\npayment-response: eyJzdWNjZXNzIjp0cnVl…\n\n{ "count": 5, "opportunities": [ … ] }`}
          />
          <p>
            We verify the authorization, run the request and settle the payment through the x402 facilitator, which
            submits the transfer on-chain. The <C>PAYMENT-RESPONSE</C> header is your receipt:
          </p>
          <CodeBlock
            title="PAYMENT-RESPONSE, decoded"
            copy={false}
            code={json({
              success: true,
              payer: "0x<your wallet>",
              transaction: "0x<transaction hash>",
              network: req.network,
              amount: req.amount,
            })}
          />
        </Step>
      </Section>

      <Section id="automatic-payments" title="Automatic payments in TypeScript">
        <p>
          In code you don&apos;t handle the three steps yourself. The official x402 client wraps <C>fetch</C>: it sees
          the 402, signs the payment and retries, so a paid request is one line. This example is tested against this
          API.
        </p>
        <CodeBlock title="Install" code="npm install @x402/fetch @x402/evm viem" />
        <CodeBlock
          title="agent.ts"
          code={`import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

// A dedicated agent wallet holding a little USDC. Keep the key in an env variable.
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as \`0x\${string}\`);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:*", client: new ExactEvmScheme(account) }],
  spendControls: { maxAmountPerPayment: "$0.10" }, // never pay more than this per request
});

const res = await fetchWithPayment("${SITE}/api/agent/v1/opportunity?category=earplugs&limit=5");
const data = await res.json();
const receipt = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE")!);

console.log(data.opportunities[0].product.name, "paid in tx", receipt.transaction);

// Then the full dossier for the top pick:
const top = data.opportunities[0].product.id;
const dossier = await (await fetchWithPayment("${SITE}/api/agent/v1/dossier?productId=" + top)).json();
console.log(dossier.verdict.label, dossier.profitEstimate?.marginPct);`}
        />
        <p>
          Any x402 v2 client works the same way. Python, Go and other clients are listed at{" "}
          <a href="https://x402.org" className={link}>
            x402.org
          </a>
          .
        </p>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <p>
          Both endpoints are <C>GET</C>, return JSON, and cost {status.priceUsdc} USDC per successful request. Live
          (ingested) products are included. Demo products are excluded unless you ask for them.
        </p>

        <div id="opportunity" className="scroll-mt-6 space-y-4">
          <h3 className="font-mono text-base font-semibold text-white">GET /api/agent/v1/opportunity</h3>
          <p>Products ranked by opportunity score, with the evidence behind each one.</p>
          <Table
            head={["Parameter", "Type", "Default", "Meaning"]}
            rows={[
              [
                <C key="c">category</C>,
                "slug",
                "all",
                <>
                  Lowercase category, e.g. <C>earplugs</C> or <C>wireless-earbuds</C>
                </>,
              ],
              [<C key="l">limit</C>, "1–25", "10", "How many products to return"],
              [<C key="s">includeSample</C>, "true | false", "false", "Also include ProductRadar's demo products"],
            ]}
          />
          <CodeBlock title="Example response (real data, abridged)" copy={false} code={OPPORTUNITY_EXAMPLE} />
        </div>

        <div id="dossier" className="scroll-mt-6 space-y-4">
          <h3 className="font-mono text-base font-semibold text-white">GET /api/agent/v1/dossier</h3>
          <p>
            The full Opportunity Dossier for one product: a rule-based verdict (High Potential, Moderate Risk or Crowded
            Market) with its confidence, every score and the evidence it used, all observed offers, a profit estimate
            with its assumptions spelled out, supplier search links, a draft Shopify import file, and up to 50 cited
            sources.
          </p>
          <Table
            head={["Parameter", "Type", "Meaning"]}
            rows={[
              [
                <C key="p">productId</C>,
                "UUID",
                <>
                  A <C>product.id</C> from the opportunity endpoint (required)
                </>,
              ],
            ]}
          />
          <CodeBlock title="Example response (real data, abridged)" copy={false} code={DOSSIER_EXAMPLE} />
        </div>
      </Section>

      <Section id="mcp" title="MCP server for Claude, Cursor and agent frameworks">
        <p>
          Install ProductRadar as a native tool, and your assistant can research products on its own, paying each call
          from a wallet you control. It runs on your machine and needs{" "}
          <a href="https://nodejs.org" className={link}>
            Node.js 20+
          </a>
          . Your key stays on your machine: it signs each payment locally, and only the signed authorization for that
          exact amount is sent.
        </p>
        <Table
          head={["Tool", "Cost", "What it returns"]}
          rows={[
            [
              <C key="f">find_product_opportunities</C>,
              <span key="p" className="whitespace-nowrap">
                {status.priceUsdc} USDC
              </span>,
              "Ranked products with scores, confidence, best offer and top evidence",
            ],
            [
              <C key="d">get_product_dossier</C>,
              <span key="p" className="whitespace-nowrap">
                {status.priceUsdc} USDC
              </span>,
              "Verdict, every score and its evidence, profit estimate, supplier search, Shopify draft",
            ],
            [<C key="s">get_payment_status</C>, "Free", "Wallet address, spending caps, payments made this session"],
          ]}
        />

        <Step n={1} title="Claude Desktop or Cursor">
          <p>
            Add this to <C>claude_desktop_config.json</C> (Claude → Settings → Developer → Edit Config) or to
            Cursor&apos;s <C>~/.cursor/mcp.json</C>, then restart the app.
          </p>
          <CodeBlock title="MCP config" code={mcpConfig} />
        </Step>

        <Step n={2} title="Claude Code">
          <CodeBlock
            title="Terminal"
            code={`claude mcp add productradar \\\n  --env PRODUCTRADAR_WALLET_PRIVATE_KEY=0xYOUR_AGENT_WALLET_KEY \\\n  -- npx -y ${MCP_TARBALL}`}
          />
        </Step>

        <Step n={3} title="Custom agent frameworks">
          <p>
            Any framework that can launch an MCP server over stdio can run the same command, with the settings below as
            environment variables. Or skip MCP and call the HTTP endpoints with an x402 client, as shown above.
          </p>
          <CodeBlock title="stdio command" code={`npx -y ${MCP_TARBALL}`} />
        </Step>

        <Table
          head={["Setting", "Default", "Meaning"]}
          rows={[
            [
              <C key="k">PRODUCTRADAR_WALLET_PRIVATE_KEY</C>,
              "none",
              "The wallet that pays. Without it, paid tools explain how to add one.",
            ],
            [<C key="m">PRODUCTRADAR_MAX_PRICE_USDC</C>, "0.10", "Never pay more than this for a single call."],
            [
              <C key="b">PRODUCTRADAR_BUDGET_USDC</C>,
              "1.00",
              "Never spend more than this per session (restart to reset).",
            ],
            [<C key="u">PRODUCTRADAR_API_URL</C>, SITE, "The API to call."],
          ]}
        />
        <p className="rounded-lg bg-zinc-900 px-4 py-3 text-sm ring-1 ring-zinc-800">
          Use a dedicated wallet holding only a few dollars of USDC, never your main wallet. The spending caps are
          enforced before anything is signed.
        </p>
      </Section>

      <Section id="errors" title="Errors">
        <p>
          You&apos;re charged only for a successful response. Apart from <C>settlement_unknown</C>, every refusal below
          leaves your payment unused: a request that fails after you sent a valid payment (for example a bad parameter)
          releases it, so the same signed payment still works on a corrected request.
        </p>
        <Table
          head={["Status", "error", "What happened"]}
          rows={[
            ["402", "(none)", "No payment attached. Read the challenge and pay."],
            ["402", <C key="1">amount_mismatch</C>, "The authorization is for a different amount than the price."],
            [
              "402",
              <C key="2">recipient_mismatch</C>,
              <>
                The authorization doesn&apos;t pay <C>payTo</C>.
              </>,
            ],
            [
              "402",
              <C key="3">authorization_expired</C>,
              <>
                <C>validBefore</C> has passed or is only seconds away. Sign a new one.
              </>,
            ],
            ["402", <C key="4">invalid_signature</C>, "The signature doesn't match the authorization or the wallet."],
            ["402", <C key="5">nonce_already_used</C>, "This authorization was already spent. Each one works once."],
            [
              "402",
              <C key="6">invalid_payment_header</C>,
              <>
                <C>PAYMENT-SIGNATURE</C> isn&apos;t valid base64 JSON in the x402 v2 shape.
              </>,
            ],
            [
              "402",
              "facilitator reasons",
              <>
                For example <C>invalid_exact_evm_insufficient_balance</C>: the wallet lacks the USDC.
              </>,
            ],
            [
              "400",
              <C key="7">invalid_query</C>,
              <>
                A parameter is wrong. <C>issues</C> says which. Not charged.
              </>,
            ],
            ["404", <C key="8">not_found</C>, "No product with that id. Not charged."],
            ["503", <C key="9">payments_unavailable</C>, "Payments aren't switched on for this server."],
            [
              "503",
              <C key="10">facilitator_unavailable</C>,
              <>
                The facilitator couldn&apos;t be reached before your request ran. Not charged. Retry after{" "}
                <C>Retry-After</C>.
              </>,
            ],
            [
              "502",
              <C key="11">settlement_unknown</C>,
              "Settlement couldn't be confirmed, so no data was returned. That authorization is retired. Sign a new one to retry.",
            ],
          ]}
        />
      </Section>

      <Section id="guarantees" title="What you can rely on">
        <ul className="list-disc space-y-3 pl-5 marker:text-zinc-600">
          <li>
            <strong className="text-white">Evidence first.</strong> Every score cites the evidence it was calculated
            from, and every piece of evidence has a source URL, an observed-at timestamp and a quality score. Nothing is
            invented: a product with no usable evidence gets no score.
          </li>
          <li>
            <strong className="text-white">Estimates, not guarantees.</strong> Scores (0–100) come with a confidence
            (0–1). Verdicts and profit figures are rule-based calculations from the same evidence, with their
            assumptions stated.
          </li>
          <li>
            <strong className="text-white">Pay only for answers.</strong> Failed requests are never settled, and each
            signed payment can be used once.
          </li>
          <li>
            <strong className="text-white">The 402 is the price list.</strong> Always pay what the challenge says. The
            price on this page is shown for convenience.
          </li>
        </ul>
        <p>
          Prefer a dashboard? The same data is in the{" "}
          <Link href="/" className={link}>
            ProductRadar app
          </Link>
          .
        </p>
      </Section>
    </main>
  );
}
