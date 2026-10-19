import { describe, expect, it } from "vitest";
import * as og from "@/app/opengraph-image";
import * as x from "@/app/twitter-image";
import { shareCard } from "./share-card";

describe("share card", () => {
  it("draws a 1200×630 PNG with the bundled mono font", async () => {
    const res = shareCard();
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]); // the IHDR width and height
  });

  it("is the same card, size and alt text for Open Graph and X", () => {
    for (const card of [og, x]) {
      expect(card.size).toEqual({ width: 1200, height: 630 });
      expect(card.contentType).toBe("image/png");
      expect(card.alt).toMatch(/^ProductRadar: a high-performance, automated Amazon and AliExpress product research pipeline\./);
    }
  });
});
