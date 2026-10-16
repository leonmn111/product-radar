import { describe, expect, it } from "vitest";
import { expandQuery, MAX_TERMS, SYNONYM_GROUPS } from "./synonyms";

describe("expandQuery", () => {
  it("expands a product word to the names sellers use, the caller's own query first", () => {
    expect(expandQuery("earbuds")).toEqual(["earbuds", "wireless earbuds", "wireless headphones", "bluetooth earphones"]);
    expect(expandQuery("leggings")).toEqual(["leggings", "yoga pants", "gym tights", "workout leggings"]);
  });

  it("keeps the caller's other words, and matches whole words only", () => {
    expect(expandQuery("High Waisted Leggings!")).toEqual(["high waisted leggings", "high waisted yoga pants", "high waisted gym tights", "high waisted workout leggings"]);
    expect(expandQuery("gym mattress")).toEqual(["gym mattress"]); // starts like "gym mat", but isn't one
  });

  it("prefers the longest match", () => {
    expect(expandQuery("wireless earbuds for running")[1]).toBe("earbuds for running");
  });

  it("works from any name in a group", () => {
    expect(expandQuery("yoga pants")).toContain("leggings");
    expect(expandQuery("bluetooth earphones")).toContain("earbuds");
  });

  it("returns the query alone when it has no known product words, and nothing for an empty one", () => {
    expect(expandQuery("ceramic coffee mug")).toEqual(["ceramic coffee mug"]);
    expect(expandQuery("  !! ")).toEqual([]);
  });

  it("never returns more than the cap, nor duplicates", () => {
    for (const group of SYNONYM_GROUPS) {
      for (const term of group) {
        const out = expandQuery(term);
        expect(out.length).toBeLessThanOrEqual(MAX_TERMS);
        expect(new Set(out).size).toBe(out.length);
        expect(out[0]).toBe(term);
      }
    }
  });
});
