// Seeds the catalog with unbranded products from a CSV (the columns: services/catalogSeed.ts). Each row goes
// through the homepage check exactly: the same live sources, the same 48-hour Dossier cache, the same engine
// and gates (POST /api/free-verdict). An AliExpress supplier link is read first, with AliExpress's official
// API (free), as a pasted AliExpress link is: a branded or delisted one is skipped before any Rainforest
// credit is spent. Then the product is saved with its
// Amazon UK prices as offers, every price as evidence, and its verdict (CatalogVerdict). A brand-restricted
// product is reported and never added (Rule 7). Nothing is estimated: a product the evidence can't price
// is saved as "Not enough evidence", with what's missing.
//
// Cost: a product not already in the 48-hour cache spends 2 to 4 Rainforest credits (AliExpress is free).
//
// Usage (the react-server condition lets it load the app's server-only modules):
//   npm run db:seed                            reads data/seed-products.csv
//   npm run db:seed -- path/to/products.csv
//   npm run db:seed -- --dry-run               verdicts only, nothing saved to the catalog

import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { db } from "@/lib/db";
import { slugify } from "@/server/ingest/ingest";
import { checkResellability } from "@/engine/compliance";
import { brandRestricted } from "@/engine/verdict";
import { QueryBudget } from "@/server/live/budget";
import { liveSources } from "@/server/live/config";
import { parseProductLink } from "@/server/live/productLink";
import { isSourceFailure, reportSourceFailure } from "@/server/live/unavailable";
import { evidenceHash, parseSeedCsv, seedVerdict, type SeedRow, type SeedVerdict, type SoldProduct } from "@/services/catalogSeed";
import { dbDossierCache } from "@/services/dossierCache";
import { getProductDossier } from "@/services/dossierService";
import type { Dossier, Evidence } from "@/types/dossier";

const gbp = (x: number) => `${x < 0 ? "−" : ""}£${Math.abs(x).toFixed(2)}`;
const slugFor = (row: SeedRow) =>
  `${slugify(row.title).slice(0, 60).replace(/-+$/, "") || "product"}-${createHash("sha1").update(row.productUrl).digest("hex").slice(0, 8)}`;
const sourceNameFor = (url: string) => {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return /(^|\.)aliexpress\./.test(host) ? "AliExpress" : host;
};

/** The product, its Amazon UK prices (an offer each, citing its evidence), the supplier price and the verdict, in one transaction. */
async function save(row: SeedRow, d: Dossier, s: SeedVerdict) {
  const q = s.verdict;
  await db.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { url: row.productUrl },
      create: { slug: slugFor(row), name: row.title, category: row.category, imageUrl: row.imageUrl, url: row.productUrl },
      update: { name: row.title, category: row.category, imageUrl: row.imageUrl },
      select: { id: true },
    });
    const keep = (e: Evidence, sourceName: string) => {
      const contentHash = evidenceHash(e);
      return tx.evidence.upsert({
        where: { productId_contentHash: { productId: product.id, contentHash } },
        create: {
          productId: product.id,
          contentHash,
          claim: e.claim,
          sourceUrl: e.sourceUrl,
          sourceName,
          sourceType: "MARKETPLACE",
          observedAt: new Date(e.observedAt),
          qualityScore: e.quality,
        },
        update: {},
        select: { id: true },
      });
    };
    for (const e of q.retail) {
      const evidence = await keep(e, "Amazon UK");
      const known = await tx.offer.findFirst({ where: { productId: product.id, sourceEvidenceId: evidence.id }, select: { id: true } });
      if (!known) {
        await tx.offer.create({
          data: { productId: product.id, sourceEvidenceId: evidence.id, merchant: "Amazon UK", url: e.sourceUrl, price: e.value as number, currency: "GBP", observedAt: new Date(e.observedAt) },
        });
      }
    }
    const supplier = await keep(s.supplier, sourceNameFor(row.supplierUrl));
    const data = {
      verdict: q.tier,
      label: q.label,
      gate: q.gate,
      reason: q.reason,
      missing: q.missing,
      asin: row.asin,
      sellingPrice: q.sellingPrice,
      supplierPrice: row.supplierPrice,
      supplierEvidenceId: supplier.id,
      keepPerSale: q.margin?.breakEvenAdCost.amount ?? null,
      checkedAt: new Date(d.generatedAt),
    };
    await tx.catalogVerdict.upsert({ where: { productId: product.id }, create: { productId: product.id, ...data }, update: data });
  });
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean", default: false } } });
  const dryRun = values["dry-run"];
  const file = positionals[0] ?? "data/seed-products.csv";
  const { rows, errors } = parseSeedCsv(readFileSync(file, "utf8"));
  for (const e of errors) console.error(`  refused  ${e}`);

  // Real sources only, as on the homepage: never development sample data. Nobody is waiting on a seed, so a
  // Rainforest call may take a minute (a UK search took 32 s on 3 November 2026, past the 25 s a visitor gets).
  const live = liveSources({ retailCallMs: 60_000 });
  if (!live.ready) throw new Error(`Live sources aren't configured: ${live.missing.join("; ")}`);
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  console.log(`${rows.length} product(s) from ${file}, database at ${host}${dryRun ? " (dry run: nothing is saved to the catalog)" : ""}.\n`);

  const tally: Record<string, number> = {};
  for (const row of rows) {
    const name = `${row.title} (${row.asin})`;
    const count = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);
    try {
      // 1. What's sold: the AliExpress listing, read first because it's free.
      let sold: SoldProduct | null = null;
      const link = parseProductLink(row.supplierUrl);
      if (link.ok && link.kind === "aliexpress" && live.sources.supplier.product) {
        const listing = await live.sources.supplier.product(link.productId, "GB", new QueryBudget({ maxCalls: 1, deadlineMs: 15_000 }));
        if (!listing) {
          console.log(`  SKIPPED    ${name}: the AliExpress listing isn't on sale for delivery to the UK.`);
          count("skipped");
          continue;
        }
        sold = { name: listing.title, brand: listing.brand };
        if (brandRestricted(checkResellability({ title: sold.name, brand: sold.brand, market: "UK" }))) {
          console.log(`  SKIPPED    ${name}: the AliExpress listing is branded ("${sold.name}"), so it's brand-restricted. No Rainforest credit spent.`);
          count("skipped");
          continue;
        }
        if (listing.unitPrice.currency === "GBP" && Math.abs(listing.unitPrice.amount - row.supplierPrice) >= 0.01) {
          console.log(`  note       ${name}: AliExpress now lists it at £${listing.unitPrice.amount.toFixed(2)}; the CSV says £${row.supplierPrice.toFixed(2)}.`);
        }
      }

      // 2. Its UK selling price and the verdict, exactly as the homepage check.
      const result = await getProductDossier(row.asin, {
        sources: live.sources,
        cache: dbDossierCache,
        sample: false,
        id: randomBytes(32).toString("hex"),
        budget: new QueryBudget({ maxCalls: 6, deadlineMs: 240_000 }),
      });
      if (!result) {
        console.log(`  NOT FOUND  ${name}: Amazon UK has no priced product at that link.`);
        count("not found");
        continue;
      }
      if (result.listingSearchFailed) {
        // A passing provider failure, not missing evidence: nothing is saved or cached, so a re-run searches again.
        console.log(`  FAILED     ${name}: Amazon UK's search for the product's other listings failed, so its price can't be confirmed. Run it again later.`);
        count("failed");
        continue;
      }
      const s = seedVerdict(row, result.dossier, new Date(), sold);
      const q = s.verdict;
      const money =
        q.margin && q.sellingPrice !== null ? `sells at ${gbp(q.sellingPrice)}, supplier ${gbp(row.supplierPrice)}, keeps ${gbp(q.margin.breakEvenAdCost.amount)} before ads` : null;
      const why = [money, q.reason, ...q.missing]
        .filter((t): t is string => Boolean(t))
        .map((t) => t.replace(/\.$/, ""))
        .join(". ");
      const cached = result.cache === "hit" ? " [from the 48-hour cache]" : "";
      if (s.skip) {
        console.log(`  SKIPPED    ${name}: ${s.skip}${cached}`);
        count("skipped");
        continue;
      }
      if (!dryRun) await save(row, result.dossier, s);
      console.log(`  ${q.label.toUpperCase().padEnd(10)} ${name}: ${why}${cached}`);
      count(q.label);
    } catch (e) {
      if (!isSourceFailure(e)) throw e;
      console.log(`  FAILED     ${name}: ${reportSourceFailure("seed-catalog", e)} Run it again later.`);
      count("failed");
    }
  }
  console.log(`\n${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing to do"}${errors.length ? `, ${errors.length} refused` : ""}.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
