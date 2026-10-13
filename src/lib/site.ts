import { env } from "@/lib/env";

/** The public site address for canonical links, sitemaps and social cards. */
export const SITE_URL = (env.APP_URL ?? "https://theproductradar.io").replace(/\/+$/, "");
