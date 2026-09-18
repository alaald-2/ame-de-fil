import type { MetadataRoute } from "next";
import { SITE_URL as BASE_URL } from "../lib/env";

// SEO.md §8 — cart/checkout/account excluded from crawling.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/*/cart", "/*/checkout", "/*/account"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
