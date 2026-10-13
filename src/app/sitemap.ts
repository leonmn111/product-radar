import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only the public pages; everything else is signed-in or per-product and kept out of search.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/docs`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
