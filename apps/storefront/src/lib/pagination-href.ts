import { getPathname } from "../i18n/navigation";
import type { AppLocale } from "./locale";

// Shared by Pagination on /shop, /categories/[slug] and /collections/[slug]
// — the query string a page link needs, given what it must preserve (q on
// /shop) vs. what resetting it implicitly drops (page, whenever /shop's `q`
// itself changes — a fresh search always starts at page 1).
export function buildShopHref(locale: AppLocale, query: string | undefined, page: number): string {
  return getPathname({
    href: {
      pathname: "/shop",
      query: { ...(query ? { q: query } : {}), ...(page > 1 ? { page } : {}) },
    },
    locale,
  });
}

export function buildCategoryHref(locale: AppLocale, slug: string, page: number): string {
  return getPathname({
    href: { pathname: "/categories/[slug]", params: { slug }, query: page > 1 ? { page } : {} },
    locale,
  });
}

export function buildCollectionHref(locale: AppLocale, slug: string, page: number): string {
  return getPathname({
    href: { pathname: "/collections/[slug]", params: { slug }, query: page > 1 ? { page } : {} },
    locale,
  });
}
