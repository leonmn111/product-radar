# ProductRadar Architecture & Rules

ProductRadar is becoming a **Live Search & Scrape on Demand** engine: every query searches live
retail and supplier sources through third-party APIs, returns cited, sellable opportunities with
real margins, and is paid per query in USDC (x402). Target design: [ARCHITECTURE.md](ARCHITECTURE.md).
Order of work and open owner decisions: [ROADMAP.md](ROADMAP.md). The running site is still v1
(a static catalog), documented in [README.md](README.md).

- Rule 1: Build in vertical slices. Do not build the entire project in one step.
- Rule 2: Keep payment logic (x402) strictly isolated from core business logic.
- Rule 3: Evidence-First. Every claim must have an attached source, timestamp, and quality score. Never invent evidence. Every response carries its citations.
- Rule 4: Treat scores as calculated estimates, not guarantees.
- Rule 5: Confidence gate. Never show a score, margin or opportunity below 0.7 confidence. Gather more evidence within the query's budget, or withhold the result and say what evidence is missing.
- Rule 6: Real numbers only. Margins come from sourced supplier cost, shipping, duty, selling price, fees, VAT and advertising. No benchmark or placeholder figures (e.g. US Census averages). A component that can't be sourced is left out and named in the result, never guessed.
- Rule 7: Sellable products only. Exclude brand-restricted and branded items; target unbranded / white-label products with a matching supplier. Record why each item was excluded.
- Rule 8: Data access within the rules. Use official APIs or licensed providers within their terms; respect robots.txt; never scrape behind a login or bypass a CAPTCHA or bot block. Every provider call is budgeted, timed out and cached. Adding a paid provider needs the owner's approval of its cost first, and tests never call paid providers.

@AGENTS.md
