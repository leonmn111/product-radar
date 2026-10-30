import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { env } from "@/lib/env";
import { agentPaymentStatus } from "@/server/payments/x402/config";
import { BAZAAR, DOSSIER_PRICE_USDC, SEARCH_PRICE_USDC } from "@/server/payments/x402/discovery";
import { encodeHeader, paymentRequiredBody } from "@/server/payments/x402/protocol";
import mcpPackage from "../../../mcp/package.json";
import { CodeBlock } from "./code-block";

// Public developer docs for the paid agent API and the MCP server. Always dark.
// The price, network and 402 example come from the live payment config, so the
// page never promises terms the API doesn't actually offer.

const SITE = (env.APP_URL ?? "https://theproductradar.io").replace(/\/+$/, "");
const MCP_TARBALL = `${SITE}/mcp/productradar-mcp-${mcpPackage.version}.tgz`;
const priceOf = (path: string) => BAZAAR.find((e) => e.path === path)?.priceUsdc ?? "?";

const TITLE = "Agent API & MCP docs | ProductRadar";
// Kept under ~155 characters, the length search results show.
const DESCRIPTION =
  "Rule-based product intelligence for AI agents: pay per request in USDC with x402, no account or API key. cURL examples, a TypeScript client and an MCP server.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/docs` },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "ProductRadar", locale: "en_GB", title: TITLE, description: DESCRIPTION, url: `${SITE}/docs` },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const NAV = [
  ["quickstart", "Quickstart"],
  ["automatic-payments", "Automatic payments"],
  ["endpoints", "Endpoints"],
  ["mcp", "MCP server"],
  ["errors", "Errors"],
  ["guarantees", "What you can rely on"],
] as const;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mint";
const link = `font-medium text-accent-mint underline decoration-accent-mint/40 underline-offset-2 hover:decoration-accent-mint ${focusRing}`;

function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-raised/80 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-100 [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

/** A field name that never breaks across lines, for narrow table columns. */
function Part({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-raised/80 px-1.5 py-0.5 font-mono text-[0.85em] whitespace-nowrap text-slate-100">{children}</code>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-5 border-t border-line-dark pt-10">
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
          className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-mint/10 text-sm text-accent-mint ring-1 ring-accent-mint/30"
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
          <dl key={i} className="space-y-2 rounded-xl border border-line-dark p-4 text-sm">
            <div className="font-medium text-white">{first}</div>
            {rest.map((cell, j) => (
              <div key={j}>
                <dt className="text-xs uppercase tracking-wide text-slate-400">{head[j + 1]}</dt>
                <dd className="mt-0.5 text-slate-300">{cell}</dd>
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
    <div className="hidden overflow-x-auto rounded-xl border border-line-dark sm:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-dark text-xs uppercase tracking-wide text-slate-400">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-dark">
          {rows.map((cells, i) => (
            <tr key={i} className="align-top">
              {cells.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-slate-300">
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

// The shape of a v2 Dossier (src/types/dossier.ts). Placeholders, not data: a real Dossier carries the
// numbers and the evidence it was built from.
const DOSSIER_SHAPE = json({
  id: "<64 hex: this request's payment identifier>",
  generatedAt: "<ISO time>",
  product: { title: "<Amazon UK title>", query: "ceramic coffee mug", market: "UK", country: "GB", currency: "GBP", identifiers: { asin: "<ASIN>" } },
  sample: false,
  notes: ["<what isn't covered, in plain words>"],
  verdict: { status: "shown", confidence: "<0.5–1>", value: { kind: "LAUNCH | TEST | AVOID", label: "Launch | Test small | Avoid | Avoid (brand-restricted)", gate: "G1_PROFIT | G3_BRAND | null", reasons: ["…"] }, evidenceIds: ["…"] },
  resellability: { brandDirect: { value: "<true | false | null>", reason: "…", evidenceIds: ["…"] }, trademarkRisk: "…", requiresUKCA: "…", cosmetics: "…", batteries: "…" },
  landedMargin: {
    status: "shown",
    confidence: "<0.7–1>",
    value: {
      uk: {
        retailPrice: { amount: "<median of the matching listings>", currency: "GBP" },
        lines: [{ kind: "supplier | shipping | duty | handling | vat | platform_fee | returns | ad_cost", label: "…", amount: { amount: "…", currency: "GBP" }, basis: "sourced | caller_supplied | estimate", evidenceIds: ["…"] }],
        landedCost: "…",
        netProfit: "…",
        netMarginPct: "…",
        roiPercentage: "…",
        breakEvenAdCost: "…",
        excluded: [{ kind: "…", label: "<a cost that couldn't be sourced>", reason: "…" }],
        complete: "<false when anything is excluded>",
      },
      eu: "<the same for an EU market, or null>",
    },
    evidenceIds: ["…"],
  },
  momentum: { status: "withheld", reason: "Insufficient Data", confidence: "…", missing: ["90 days of sales-rank history (…)"] },
  saturation: { status: "shown", confidence: "…", value: { sellerCount: "…", storeCount: "…", adDensity: null }, evidenceIds: ["…"] },
  supplierMatches: [{ platform: "aliexpress", listingUrl: "https://www.aliexpress.com/item/<id>.html", title: "…", unitPrice: { amount: "…", currency: "GBP" }, moq: null, deliveryDays: null, matchScore: "<0–1>", image: "…", evidenceIds: ["…"] }],
  evidence: [{ id: "…", provider: "rainforest | aliexpress | keepa | gov.uk | …", sourceType: "marketplace | supplier | official | …", sourceUrl: "…", observedAt: "<ISO time>", quality: "<0–100>", claim: "…", value: "…" }],
  exports: { shopifyCsvUrl: "/api/agent/v2/dossier/<ASIN>/export/csv", pdfUrl: null, shareLink: null },
});

export default function DocsPage() {
  return (
    <div className="flex-1 bg-background-dark text-slate-300 [color-scheme:dark]">
      {/* Keeps overscroll and the area below short pages dark too. */}
      <style>{"body{background:#0a0f1d}"}</style>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-accent-mint focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent"
      >
        Skip to content
      </a>

      <header className="border-b border-line-dark">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 text-sm whitespace-nowrap">
            <Link href="/" className={`rounded font-semibold tracking-tight text-accent-mint ${focusRing}`}>
              ProductRadar
            </Link>
            <span aria-hidden className="text-slate-600">
              /
            </span>
            <span className="text-slate-300">
              <span className="hidden sm:inline">Agent API </span>Docs
            </span>
          </div>
          <Link
            href="/dashboard"
            className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-200 ring-1 ring-line-dark hover:bg-surface-raised ${focusRing}`}
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 lg:px-8">
        <nav aria-label="On this page" className="pt-8 lg:sticky lg:top-0 lg:max-h-screen lg:self-start lg:pt-12">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">On this page</p>
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={`block rounded-md px-3 py-1.5 text-sm text-slate-300 ring-1 ring-line-dark hover:bg-surface-dark hover:text-white lg:ring-0 ${focusRing}`}
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
      <div className="h-4 w-48 animate-pulse rounded bg-surface-dark" />
      <div className="h-20 animate-pulse rounded-lg bg-surface-dark" />
      <div className="h-24 animate-pulse rounded-lg bg-surface-dark" />
      <div className="h-16 animate-pulse rounded-xl bg-surface-dark" />
    </main>
  );
}

async function DocsMain() {
  // Read per request, not at build time: the terms shown always match what the API charges right now.
  await connection();
  const status = agentPaymentStatus(SEARCH_PRICE_USDC);
  const req = status.requirements;
  const exampleUrl = `${SITE}/api/agent/v2/search?q=ceramic+coffee+mug`;
  const challenge = paymentRequiredBody(
    {
      url: exampleUrl,
      description: "ProductRadar search: an 8-part product Dossier with cited evidence",
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
        env: { PRODUCTRADAR_WALLET_PRIVATE_KEY: "0xYOUR_AGENT_WALLET_KEY", PRODUCTRADAR_BUDGET_USDC: "5.00" },
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
    offers: [
      { "@type": "Offer", name: "Search", price: SEARCH_PRICE_USDC, priceCurrency: "USDC" },
      { "@type": "Offer", name: "Standard Dossier", price: DOSSIER_PRICE_USDC, priceCurrency: "USDC" },
    ],
  };

  return (
    <main id="main" className="min-w-0 max-w-3xl space-y-12 pb-24 pt-10 lg:pt-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="space-y-6">
        <p className="text-sm font-medium text-accent-mint">For developers and AI agents</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Product research your agent can buy by the request
        </h1>
        <p className="text-lg leading-relaxed text-slate-300">
          An 8-part Dossier for any Amazon UK product: verdict, resellability, UK/EU landed margin after VAT, duty,
          fees and advertising, momentum, saturation, supplier matches, evidence and exports. Every number is
          calculated from sourced, timestamped evidence, and a part without enough of it is withheld, never estimated.
          No account and no API key: your agent pays in USDC per request using the{" "}
          <a href="https://x402.org" className={link}>
            x402 protocol
          </a>
          , and gets the data in the same HTTP exchange.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="#quickstart"
            className={`rounded-lg bg-accent-mint px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-mint-strong ${focusRing}`}
          >
            Make your first request
          </a>
          <a
            href="#mcp"
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-100 ring-1 ring-line-dark hover:bg-surface-dark ${focusRing}`}
          >
            Add to Claude or Cursor
          </a>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-xl border border-line-dark bg-surface-raised sm:grid-cols-3">
          <div className="bg-background-dark p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Price</dt>
            <dd className="mt-1 font-semibold text-white">
              {SEARCH_PRICE_USDC} USDC per search
              <span className="block text-sm font-normal text-slate-400">{DOSSIER_PRICE_USDC} USDC per Standard Dossier</span>
            </dd>
          </div>
          <div className="bg-background-dark p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Network</dt>
            <dd className="mt-1 font-semibold text-white">
              {status.networkLabel}
              {status.testnet && <span className="font-normal text-slate-400"> (testnet)</span>}
            </dd>
          </div>
          <div className="bg-background-dark p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Status</dt>
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
          <p className="rounded-lg bg-surface-dark px-4 py-3 text-sm text-slate-300 ring-1 ring-line-dark">
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
            code={`HTTP/2 200\ncontent-type: application/json\npayment-response: eyJzdWNjZXNzIjp0cnVl…\n\n{ "id": "…", "product": { … }, "verdict": { … }, "landedMargin": { … }, … }`}
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
          the 402, signs the payment and retries, so a paid request is one line.
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
  spendControls: { maxAmountPerPayment: "$${DOSSIER_PRICE_USDC}" }, // never pay more than this per request
});

// A search (${SEARCH_PRICE_USDC} USDC): the Dossier for the product most Amazon UK listings agree on.
const res = await fetchWithPayment("${SITE}/api/agent/v2/search?q=ceramic+coffee+mug");
const found = await res.json();
const receipt = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE")!);
console.log(found.product.title, found.verdict.status === "shown" ? found.verdict.value.kind : found.verdict.missing, "tx", receipt.transaction);

// Then the Standard Dossier for that product (${DOSSIER_PRICE_USDC} USDC), by its ASIN:
const asin = found.product.identifiers.asin;
const dossier = await (await fetchWithPayment(\`${SITE}/api/agent/v2/dossier/\${asin}\`)).json();
const margin = dossier.landedMargin;
console.log(margin.status === "shown" ? margin.value.uk.netProfit : margin.missing);`}
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
          The paid endpoints are <C>GET</C> and return JSON: an 8-part Dossier. You pay only for a successful answer: a
          search with no listings, an unknown product, or a data source failing part-way is answered with an error and
          not charged. The same list, with input and output schemas, is at{" "}
          <a href={`${SITE}/api/agent/v2/bazaar`} className={link}>
            /api/agent/v2/bazaar
          </a>{" "}
          (x402 Bazaar format, free).
        </p>

        <div id="search" className="scroll-mt-6 space-y-4">
          <h3 className="font-mono text-base font-semibold text-white">GET /api/agent/v2/search · {priceOf("/api/agent/v2/search")} USDC</h3>
          <p>
            Searches Amazon UK for <C>q</C> and returns the Dossier for the product most listings agree on. When too
            few listings agree, a synonym of the query is searched too. A search with no listings answers{" "}
            <C>404 no_results</C>.
          </p>
          <Table
            head={["Parameter", "Type", "Meaning"]}
            rows={[
              [
                <C key="q">q</C>,
                "text, 2–120",
                <>
                  What to look for, in plain words, e.g. <C>ceramic coffee mug</C> (required)
                </>,
              ],
            ]}
          />
        </div>

        <div id="dossier" className="scroll-mt-6 space-y-4">
          <h3 className="font-mono text-base font-semibold text-white">GET /api/agent/v2/dossier/{"{asin}"} · {priceOf("/api/agent/v2/dossier/:asin")} USDC</h3>
          <p>
            The Standard Dossier for one Amazon UK product: its product page (price, brand, seller, category), other
            listings of it, and supplier matches. A copy built in the last 48 hours is reused (header{" "}
            <C>X-Dossier-Cache: hit</C>, no new provider calls); you pay the same. The wallet that bought a Dossier
            reopens it free with Sign-In-With-X. A product Amazon UK doesn&apos;t have answers <C>404 no_product</C>.
          </p>
          <Table
            head={["Parameter", "Type", "Meaning"]}
            rows={[[<C key="a">asin</C>, "10 characters", "The Amazon UK ASIN, in the path, e.g. B0CH33F5P2"]]}
          />
          <p>
            <C>GET /api/agent/v2/dossier/{"{asin}"}/export/csv</C> returns a bought Dossier as a Shopify product import
            file, free for its buyer (Sign-In-With-X). It answers <C>409 export_unavailable</C> while the parts it needs
            are withheld.
          </p>
        </div>

        <div id="dossier-parts" className="scroll-mt-6 space-y-4">
          <h3 className="text-base font-semibold text-white">What a Dossier holds</h3>
          <p>
            Parts with a gate are either <C>{`{ status: "shown", confidence, value, evidenceIds }`}</C> or{" "}
            <C>{`{ status: "withheld", reason, confidence, missing }`}</C>, where <C>missing</C> says what evidence would
            show them. Nothing below its gate is estimated.
          </p>
          <Table
            head={["Part", "Gate", "What it holds"]}
            rows={[
              [<Part key="v">verdict</Part>, "0.5", "LAUNCH (Launch), TEST (Test small) or AVOID (Avoid), with plain-words reasons. Two hard gates come first: a brand or trademark is AVOID, \"Avoid (brand-restricted)\" (G3), with no supplier matches; a loss before ads is AVOID, \"Loses £X per sale before ads\" (G1). Withheld reads \"Not enough evidence\"."],
              [<Part key="r">resellability</Part>, "none", "Brand-direct seller, trademark risk, UKCA/CE marking, cosmetics and battery rules: each true, false or not checkable, with its reason"],
              [
                <Part key="l">landedMargin</Part>,
                "0.7",
                "UK (and, with EU listings, EU) margin: retail price, every cost line (supplier, shipping, duty, VAT, platform fees, advertising) with its evidence, landed cost, net profit, margin %, ROI and break-even ad cost. A cost that can't be sourced is listed in excluded, never guessed",
              ],
              [<Part key="m">momentum</Part>, "0.7", "12-week sales-rank and price trend from Keepa: ACCELERATING, FLAT or DECELERATING"],
              [<Part key="s">saturation</Part>, "0.7", "Sellers and stores listing the same product"],
              [<Part key="u">supplierMatches</Part>, "none", "Up to three AliExpress listings of the same product, with unit price and match score"],
              [<Part key="e">evidence</Part>, "none", "Every source behind the numbers: provider, URL, observed time, quality (0–100) and the claim"],
              [<Part key="x">exports</Part>, "none", "The Shopify CSV link, once the parts it needs are shown"],
            ]}
          />
          <CodeBlock title="Response shape (placeholders, not data)" copy={false} code={DOSSIER_SHAPE} />
        </div>

        <p className="text-sm text-slate-400">
          The v1 catalog endpoints (<C>/api/agent/v1/opportunity</C>, <C>/api/agent/v1/dossier</C>) still answer for
          MCP installs from before 0.2.0, but are retired: build on v2.
        </p>
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
              <C key="f">search_products</C>,
              <span key="p" className="whitespace-nowrap">
                {priceOf("/api/agent/v2/search")} USDC
              </span>,
              "Plain-words search of Amazon UK; the 8-part Dossier for the product most listings agree on",
            ],
            [
              <C key="d">get_product_dossier</C>,
              <span key="p" className="whitespace-nowrap">
                {priceOf("/api/agent/v2/dossier/:asin")} USDC
              </span>,
              "The Standard 8-part Dossier for one Amazon UK product (ASIN): verdict, resellability, UK/EU landed margin after VAT, duty, fees and ads, momentum, saturation, supplier matches, cited evidence, exports",
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
            [<C key="m">PRODUCTRADAR_MAX_PRICE_USDC</C>, "2.00", "Never pay more than this for a single call."],
            [
              <C key="b">PRODUCTRADAR_BUDGET_USDC</C>,
              "5.00",
              "Never spend more than this per session (restart to reset).",
            ],
            [<C key="u">PRODUCTRADAR_API_URL</C>, SITE, "The API to call."],
          ]}
        />
        <p className="rounded-lg bg-surface-dark px-4 py-3 text-sm ring-1 ring-line-dark">
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
              <C key="12">insufficient_funds</C>,
              <>
                The paying wallet doesn&apos;t hold enough USDC on this network. <C>message</C> says how much it has and
                what the request costs. Not charged.
              </>,
            ],
            [
              "402",
              "facilitator reasons",
              <>
                Any other refusal from the facilitator, passed on as is. For example <C>kyt_risk_detected</C>: the wallet
                failed sanctions screening.
              </>,
            ],
            [
              "400",
              <C key="7">invalid_query</C>,
              <>
                A parameter is wrong. <C>issues</C> says which. Not charged.
              </>,
            ],
            [
              "404",
              <>
                <C key="8">no_results</C>, <C key="8b">no_product</C>
              </>,
              "The search matched no Amazon UK listings, or Amazon UK has no priced product with that ASIN. Not charged.",
            ],
            [
              "503",
              <C key="13">source_unavailable</C>,
              <>
                A data source (Amazon UK or AliExpress) failed while your request ran, so no Dossier was built: never a
                verdict made from missing data. Not charged. Retry after <C>Retry-After</C>.
              </>,
            ],
            ["503", <C key="14">live_search_unavailable</C>, "Live sources aren't connected. Answered before payment."],
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
              <>
                Settlement couldn&apos;t be confirmed, so no data was returned. That authorization is retired. Sign a
                new one to retry. If <C>transaction</C> is present, the transfer was sent and may still confirm: check
                it on a block explorer first.
              </>,
            ],
          ]}
        />
      </Section>

      <Section id="guarantees" title="What you can rely on">
        <ul className="list-disc space-y-3 pl-5 marker:text-slate-600">
          <li>
            <strong className="text-white">Evidence first.</strong> Every number cites the evidence it was calculated
            from, and every piece of evidence has a source URL, an observed-at timestamp and a quality score. Nothing is
            invented: a part without enough evidence is withheld and says what&apos;s missing.
          </li>
          <li>
            <strong className="text-white">Estimates, not guarantees.</strong> Every gated part comes with a confidence
            (0–1). Verdicts and margins are rule-based calculations from the same evidence, with every cost line and
            every excluded cost named.
          </li>
          <li>
            <strong className="text-white">Pay only for answers.</strong> Failed requests are never settled, including
            one where a data source fails part-way, and each signed payment can be used once.
          </li>
          <li>
            <strong className="text-white">The 402 is the price list.</strong> Always pay what the challenge says. The
            prices on this page are shown for convenience.
          </li>
        </ul>
        <p>
          Prefer to click? People run the same Dossiers in the{" "}
          <Link href="/terminal" className={link}>
            Dossier terminal
          </Link>
          , paid in credits.
        </p>
      </Section>
    </main>
  );
}
