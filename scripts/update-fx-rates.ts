// Refreshes src/server/scoring/fx-rates.json from the European Central Bank's daily
// euro reference rates (free, no key). Scores use these only to compare prices in
// different currencies. Commit the file and redeploy, then rescore.
//
// Usage: npm run fx:update
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ECB_DAILY_URL, parseEcbDaily } from "../src/server/scoring/fx";

const OUT = path.join(import.meta.dirname, "../src/server/scoring/fx-rates.json");

(async () => {
  const res = await fetch(ECB_DAILY_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ECB answered HTTP ${res.status}`);
  const fx = parseEcbDaily(await res.text());
  const file = {
    source: "European Central Bank euro foreign exchange reference rates",
    sourceUrl: ECB_DAILY_URL,
    ...fx,
  };
  writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Saved ${Object.keys(fx.perEur).length} rates from ${fx.date} (1 EUR = ${fx.perEur.USD} USD = ${fx.perEur.GBP} GBP).`);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
