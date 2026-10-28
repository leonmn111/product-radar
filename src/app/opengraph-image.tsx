import { SHARE_CARD_ALT, shareCard } from "@/components/brand/share-card";

// The Open Graph card (Facebook, LinkedIn, Slack, WhatsApp…) for every page: the terminal-themed share card, built at deploy time.
// Card version: 2026-10-28, the official ProductRadar logo (public/Logowithwriting.png, reversed). The image's URL carries a hash of this file (not of
// share-card.tsx) and social sites cache cards by URL, so when the card's design changes, update this line.
export const alt = SHARE_CARD_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return shareCard();
}
