import { defineRouting } from "next-intl/routing";

// Sweden-only market, sv-SE + en only (DECISIONS.md ADR-021) — no fr-FR.
// Localized path *segments*, not just a locale prefix (SEO.md §2, approved
// in Phase 0) — a Swedish visitor gets /produkter/..., not /sv/products/....
export const routing = defineRouting({
  locales: ["sv-SE", "en"],
  defaultLocale: "sv-SE",
  pathnames: {
    "/": "/",
    "/shop": { "sv-SE": "/produkter", en: "/products" },
    "/products/[slug]": { "sv-SE": "/produkter/[slug]", en: "/products/[slug]" },
    "/categories/[slug]": { "sv-SE": "/kategorier/[slug]", en: "/categories/[slug]" },
    "/collections": { "sv-SE": "/kollektioner", en: "/collections" },
    "/collections/[slug]": { "sv-SE": "/kollektioner/[slug]", en: "/collections/[slug]" },
    "/cart": { "sv-SE": "/varukorg", en: "/cart" },
    "/checkout": { "sv-SE": "/kassa", en: "/checkout" },
    "/login": { "sv-SE": "/logga-in", en: "/login" },
    "/account": { "sv-SE": "/mitt-konto", en: "/account" },
    "/account/orders": { "sv-SE": "/mitt-konto/ordrar", en: "/account/orders" },
    "/account/orders/[orderId]": {
      "sv-SE": "/mitt-konto/ordrar/[orderId]",
      en: "/account/orders/[orderId]",
    },
    "/account/addresses": { "sv-SE": "/mitt-konto/adresser", en: "/account/addresses" },
    "/account/addresses/new": { "sv-SE": "/mitt-konto/adresser/ny", en: "/account/addresses/new" },
    "/account/addresses/[addressId]": {
      "sv-SE": "/mitt-konto/adresser/[addressId]",
      en: "/account/addresses/[addressId]",
    },
    "/create-account": { "sv-SE": "/skapa-konto", en: "/create-account" },
    "/verify-email": { "sv-SE": "/verifiera-e-post", en: "/verify-email" },
    "/forgot-password": { "sv-SE": "/glomt-losenord", en: "/forgot-password" },
    "/reset-password": { "sv-SE": "/aterstall-losenord", en: "/reset-password" },
    // Placeholder footer/nav links — no page exists behind these yet
    // (content module is a later phase); declared here only so next-intl's
    // typed Link doesn't reject them, identical path in both locales for now.
    "/shipping": "/shipping",
    "/contact": "/contact",
    "/about": "/about",
  },
});
