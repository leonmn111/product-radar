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
- Rule 5: Confidence gates. A Verdict is shown only at 0.5 confidence or more; every number (margins, momentum, saturation, scores) needs 0.7. Below its gate a part is withheld, never estimated: gather more evidence within the query's budget, or say what evidence is missing.
- Rule 6: Real numbers only. Margins come from sourced supplier cost, shipping, duty, selling price, fees, VAT and advertising. No benchmark or placeholder figures (e.g. US Census averages). A component that can't be sourced is left out and named in the result, never guessed.
- Rule 7: Branded is a risk, warned, not hidden. Every product runs the resale checks first (brand or trademark, UKCA marking, cosmetics, batteries), and each failure is recorded with its reason and evidence. A brand or trademark failure classifies the product as "High IP Risk" (only regulated-goods failures: "Compliance Gated"). It is never excluded and its features are never hidden or locked. No supplier cost is sourced for it, so its sourced landed margin stays withheld, but the profit calculator, supplier search and Shopify export stay open under strict warning banners: dropshipping or private label risks a store ban, margins are for authorised wholesale only (the seller enters their own wholesale cost), unauthorised suppliers carry counterfeit risk, and the Shopify export asks for confirmation first. Sourced margins target unbranded / white-label products with an exact supplier match.
- Rule 8: Data access within the rules. Use official APIs or licensed providers within their terms; respect robots.txt; never scrape behind a login or bypass a CAPTCHA or bot block. Every provider call is budgeted, timed out and cached. Adding a paid provider needs the owner's approval of its cost first, and tests never call paid providers.

## Tooling

- Run external tools and documentation lookups as command-line tools (with `--json` output where supported), not as persistent MCP server registrations. A registered server loads its tool list into every session's context window; a CLI uses context only when it runs. For MCP and x402 checks use `mcpc` (installed globally) and `npx -y @modelcontextprotocol/inspector --cli`.

@AGENTS.md
