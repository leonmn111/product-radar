import { shareCard } from "@/components/brand/share-card";

// The X/Twitter card for every page. Built at deploy time.
export const alt = "ProductRadar: find the spread, ignore the noise. Rule-based product intelligence and Shopify export tools.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return shareCard();
}
