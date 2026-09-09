import type { MetadataRoute } from "next";
import { routing } from "../i18n/routing";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

// Foundation only — real entries (product/category/collection URLs)
// populate once the catalog exists (SEO.md §3). One entry per locale for now.
export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: `${BASE_URL}/${locale}`,
    lastModified: new Date(),
  }));
}
