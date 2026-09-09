import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

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
