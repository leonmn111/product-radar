import { describe, expect, it } from "vitest";
import { calculateImageSimilarity, ImageMatchInputError, SIMULATED_RANGE, simulatedImageMatcher } from "./imageMatch";

const amazon = "https://m.media-amazon.com/images/I/516Z4HFBZUL.jpg";
const aliexpress = "https://ae01.alicdn.com/kf/S1.jpg";

describe("calculateImageSimilarity (simulated)", () => {
  it("returns a 3-decimal similarity from 0.6 to 0.99", () => {
    for (let i = 0; i < 500; i++) {
      const s = calculateImageSimilarity(amazon, aliexpress);
      expect(s).toBeGreaterThanOrEqual(SIMULATED_RANGE.min);
      expect(s).toBeLessThanOrEqual(SIMULATED_RANGE.max);
      expect(Math.round(s * 1000) / 1000).toBe(s);
    }
  });

  it("refuses something that isn't an image URL", () => {
    expect(() => calculateImageSimilarity("not a url", aliexpress)).toThrow(ImageMatchInputError);
    expect(() => calculateImageSimilarity(amazon, "ftp://example.com/a.jpg")).toThrow(ImageMatchInputError);
  });

  it("is labelled simulated, so a real Dossier can refuse it", () => {
    expect(simulatedImageMatcher.method).toBe("simulated");
  });
});
