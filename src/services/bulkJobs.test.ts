import { describe, expect, it } from "vitest";
import { MAX_BULK_ASINS, parseAsinCsv } from "./bulkJobs";

describe("parseAsinCsv", () => {
  it("reads an asin column under a header, in order, dropping duplicates", () => {
    expect(parseAsinCsv("name,asin\nMug,B0MUGAAAA1\nBottle,b0bottle01\nMug again,B0MUGAAAA1\n")).toEqual({
      asins: ["B0MUGAAAA1", "B0BOTTLE01"],
      duplicates: 1,
      invalid: [],
    });
  });

  it("takes the first column when there's no header, and Amazon links as well as ASINs", () => {
    const csv = ["B0MUGAAAA1,anything", "https://www.amazon.co.uk/Mug/dp/B0BOTTLE01?th=1", '"B0CUPAAAA1", "x, y"', "", "﻿"].join("\r\n");
    expect(parseAsinCsv(csv).asins).toEqual(["B0MUGAAAA1", "B0BOTTLE01", "B0CUPAAAA1"]);
  });

  it("names the rows that aren't ASINs (row numbers as in the file)", () => {
    expect(parseAsinCsv("productId\nB0MUGAAAA1\nnot-an-asin\n\nB0SHORT").invalid).toEqual([
      { row: 3, value: "not-an-asin" },
      { row: 5, value: "B0SHORT" },
    ]);
  });

  it("handles quotes, semicolons and tabs, and an empty file", () => {
    expect(parseAsinCsv('asin;note\n"B0MUGAAAA1";"he said ""hi"""\nB0BOTTLE01\tx').asins).toEqual(["B0MUGAAAA1", "B0BOTTLE01"]);
    expect(parseAsinCsv("")).toEqual({ asins: [], duplicates: 0, invalid: [] });
    expect(MAX_BULK_ASINS).toBe(100);
  });
});
