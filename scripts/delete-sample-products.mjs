// Deletes the made-up demo products the old seed script created for early UI testing, and nothing else.
// A product is deleted only if ALL of these hold:
//   - it is flagged isSample = true;
//   - its brand is a fictional "(sample)" brand;
//   - every evidence row it has is flagged isSample and points at the reserved example.com domain.
// Real products (isSample = false, real store pages) can never match. Offers, evidence and scores go
// with the product (ON DELETE CASCADE), in one transaction.
//
// Usage (plain Node, so it also runs on the production server, where tsx isn't installed):
//   node --env-file=.env scripts/delete-sample-products.mjs            dry run: lists what would go
//   node --env-file=.env scripts/delete-sample-products.mjs --confirm  deletes them
// On Railway: railway ssh --service web -- sh -c "cd /app && NODE_PATH=/app/node_modules node scripts/delete-sample-products.mjs"

import pg from "pg";

const confirm = process.argv.includes("--confirm");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const FIND = `
  SELECT p.id, p.slug, p.name, p.brand,
         count(e.id)::int AS evidence,
         count(e.id) FILTER (WHERE e."isSample" AND e."sourceUrl" ~ '^https?://([a-z0-9-]+\\.)*example\\.com(/|$)')::int AS fake_evidence
  FROM "Product" p
  LEFT JOIN "Evidence" e ON e."productId" = p.id
  WHERE p."isSample" AND p.brand ILIKE '%(sample)%'
  GROUP BY p.id
  ORDER BY p.slug`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(FIND);
  const doomed = rows.filter((r) => r.evidence === r.fake_evidence);
  const skipped = rows.filter((r) => r.evidence !== r.fake_evidence);
  for (const r of skipped) console.log(`KEEP   ${r.slug}: ${r.evidence - r.fake_evidence} evidence row(s) aren't demo data`);
  for (const r of doomed) console.log(`${confirm ? "DELETE" : "WOULD DELETE"} ${r.slug} (${r.name}, ${r.brand}, ${r.evidence} demo evidence rows)`);
  if (!doomed.length) console.log("No demo products found.");
  if (confirm && doomed.length) {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`DELETE FROM "Product" WHERE id = ANY($1::uuid[]) AND "isSample"`, [doomed.map((r) => r.id)]);
    if (rowCount !== doomed.length) throw new Error(`expected to delete ${doomed.length}, deleted ${rowCount}`);
    await client.query("COMMIT");
    console.log(`Deleted ${rowCount} demo product(s).`);
  } else if (doomed.length) {
    console.log("Dry run: nothing deleted. Add --confirm to delete.");
  }
  const left = await client.query(`SELECT count(*)::int AS n FROM "Product" WHERE NOT "isSample"`);
  console.log(`Real products in the database: ${left.rows[0].n}`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
