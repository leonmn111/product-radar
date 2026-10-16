// Supplier image matching (ROADMAP.md › Phase 1): does a 1688 / AliExpress listing show the exact
// white-label item sold on Amazon? A similarity from 0 to 1 between the two product images.
//
// SCAFFOLD. calculateImageSimilarity() is SIMULATED: it returns a random 0.6–0.99 and looks at
// nothing. A real comparison (perceptual hash, SSIM or a vision model) replaces it in Phase 1. Until
// then a made-up score must never reach a real Dossier (CLAUDE.md Rule 3), so the simulated matcher
// is labelled `method: "simulated"` and buildDossier() refuses it for anything but development sample data.

/** How a similarity was measured. Real methods are added here as they're built. */
export type ImageMatchMethod = "simulated";

export interface ImageMatcher {
  readonly method: ImageMatchMethod;
  /** 0–1: how likely the two images show the same product. */
  compare(retailImageUrl: string, supplierImageUrl: string): number;
}

export class ImageMatchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageMatchInputError";
  }
}

const isHttpUrl = (s: string) => {
  try {
    return ["https:", "http:"].includes(new URL(s).protocol);
  } catch {
    return false;
  }
};

export const SIMULATED_RANGE = { min: 0.6, max: 0.99 } as const;

/**
 * SIMULATED structural / perceptual similarity of two product images: a random float from 0.6 to
 * 0.99, rounded to 3 decimals. Throws ImageMatchInputError for a URL that isn't http(s).
 */
export function calculateImageSimilarity(retailImageUrl: string, supplierImageUrl: string): number {
  if (!isHttpUrl(retailImageUrl)) throw new ImageMatchInputError(`retailImageUrl is not an http(s) URL: ${retailImageUrl}`);
  if (!isHttpUrl(supplierImageUrl)) throw new ImageMatchInputError(`supplierImageUrl is not an http(s) URL: ${supplierImageUrl}`);
  const { min, max } = SIMULATED_RANGE;
  return Math.round((min + Math.random() * (max - min)) * 1000) / 1000;
}

/** The simulated matcher: development sample data only. */
export const simulatedImageMatcher: ImageMatcher = { method: "simulated", compare: calculateImageSimilarity };
