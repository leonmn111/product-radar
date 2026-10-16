import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/docs"],
      disallow: ["/api/", "/account", "/billing/", "/dashboard", "/dev/", "/dossier/", "/search", "/signin", "/upgrade"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
