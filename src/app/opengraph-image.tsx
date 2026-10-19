import { SHARE_CARD_ALT, shareCard } from "@/components/brand/share-card";

// The Open Graph card (Facebook, LinkedIn, Slack, WhatsApp…) for every page: the terminal-themed share card, built at deploy time.
export const alt = SHARE_CARD_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return shareCard();
}
