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
- Rule 7: Sellable products only. Exclude brand-restricted and branded items; target unbranded / white-label products with a matching supplier. Record why each item was excluded.
- Rule 8: Data access within the rules. Use official APIs or licensed providers within their terms; respect robots.txt; never scrape behind a login or bypass a CAPTCHA or bot block. Every provider call is budgeted, timed out and cached. Adding a paid provider needs the owner's approval of its cost first, and tests never call paid providers.

@AGENTS.md
