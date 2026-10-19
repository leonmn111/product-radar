import { SHARE_CARD_ALT, shareCard } from "@/components/brand/share-card";

// The API docs page sets its own share title and description, which replaces the site-wide card; this puts it back.
export const alt = SHARE_CARD_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return shareCard();
}
