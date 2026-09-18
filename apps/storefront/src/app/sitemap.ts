import type { MetadataRoute } from "next";
import { routing } from "../i18n/routing";
import { SITE_URL as BASE_URL } from "../lib/env";

// Foundation only — real entries (product/category/collection URLs) are not
// yet populated here (SEO.md §3). One entry per locale for now.
export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: `${BASE_URL}/${locale}`,
    lastModified: new Date(),
  }));
}
