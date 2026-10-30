# ProductRadar Architecture & Rules

ProductRadar is becoming a zero-tolerance financial screener for UK and EU sellers: an 8-part Dossier
per product (verdict, resellability, landed margin, momentum, saturation, supplier matches, evidence,
exports), built from live third-party sources and paid in USDC (x402) or with Stripe credit packs.
Design: [ARCHITECTURE.md](ARCHITECTURE.md). Order of work: [ROADMAP.md](ROADMAP.md). The running site
is still v1 (a static catalog), documented in [README.md](README.md).

- Rule 1: Build in vertical slices. Do not build the entire project in one step.
- Rule 2: Keep payment logic (x402) strictly isolated from core business logic.
- Rule 3: Evidence-First. Every claim must have an attached source, timestamp, and quality score. Never invent evidence. Every response carries its citations.
- Rule 4: Treat scores as calculated estimates, not guarantees.
- Rule 5: Confidence gates. A Verdict is shown only at 0.5 confidence or more; every number (margins, momentum, saturation, scores) needs 0.7. Below its gate a part is withheld, never estimated: gather more evidence within the query's budget, or say what evidence is missing. Verdicts use one four-tier scale (src/engine/verdict.ts): "Launch", "Test small", "Avoid" and "Not enough evidence" (withheld). Two hard gates decide first, whatever the scores say: G3, a branded product is "Avoid (brand-restricted)" (Rule 7, even below 0.5, since it reads the listing's own text); G1, a contribution before ads of £0 or less on the cheapest modelled channel is "Avoid" with the reason "Loses £X per sale before ads". Launch needs a proven profit, every cost counted; without one the best verdict is "Test small".
- Rule 6: Real numbers only. Margins come from sourced supplier cost, shipping, duty, selling price, fees, VAT and advertising. No benchmark or placeholder figures (e.g. US Census averages). A component that can't be sourced is left out and named in the result, never guessed.
- Rule 7: Branded is brand-restricted: warned, never recommended. Every product runs the resale checks first (brand or trademark, UKCA marking, cosmetics, batteries), and each failure is recorded with its reason and evidence. A brand or trademark failure classifies the product as "High IP Risk" (only regulated-goods failures: "Compliance Gated"). It is never excluded, blurred or locked, but High IP Risk is gate G3: the verdict is "Avoid (brand-restricted)", no supplier is searched for it, no landed margin is calculated, and no supplier link is ever shown for it, in the dossier, the paid Dossier or any API. The profit calculator stays open (for the brand's wholesale price, under the warning "⚠️ HIGH IP RISK: Dropshipping this brand risks a store ban. Margins shown are for authorized wholesale only."), and so does the Shopify export, which asks for confirmation first. Compliance Gated products keep their margin and the strict 80% exact supplier match under warning banners, like every other product.
- Rule 8: Data access within the rules. Use official APIs or licensed providers within their terms; respect robots.txt; never scrape behind a login or bypass a CAPTCHA or bot block. Every provider call is budgeted, timed out and cached. Adding a paid provider needs the owner's approval of its cost first, and tests never call paid providers.

## Tooling

- Run external tools and documentation lookups as command-line tools (with `--json` output where supported), not as persistent MCP server registrations. A registered server loads its tool list into every session's context window; a CLI uses context only when it runs. For MCP and x402 checks use `mcpc` (installed globally) and `npx -y @modelcontextprotocol/inspector --cli`.

@AGENTS.md
