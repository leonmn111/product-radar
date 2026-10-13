import "server-only";
import { cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { showcaseSnapshot } from "./service";

const HOUR_MS = 3_600_000;

/**
 * The landing page's showcase products and live counts, one snapshot per hour.
 * Call it only after `await connection()`, so it runs per request and never during the build.
 */
export async function getShowcase() {
  // Read the clock here, outside the cache: a cached scope that reads it makes `next dev`
  // reload the page forever. Rounding up to the hour keys one snapshot per hour, and an
  // offer captured minutes ago still counts as current.
  return showcaseAt(Math.ceil(Date.now() / HOUR_MS) * HOUR_MS);
}

async function showcaseAt(asOfMs: number) {
  "use cache";
  cacheLife("hours");
  return showcaseSnapshot(db, new Date(asOfMs));
}
