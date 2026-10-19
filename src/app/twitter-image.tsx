import { SHARE_CARD_ALT, shareCard } from "@/components/brand/share-card";

// The X/Twitter card (summary_large_image) for every page: the same terminal-themed share card, built at deploy time.
export const alt = SHARE_CARD_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return shareCard();
}
