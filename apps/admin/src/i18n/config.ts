// Admin UI display language — a client-preference cookie (see request.ts),
// completely separate from the backend's own User.locale field (the
// customer-facing sv-SE/en enum used for e.g. transactional email
// language, apps/api's Prisma schema). Adding "es" here has no bearing on,
// and does not touch, that backend enum or the storefront's own locale
// strategy — this widens only what an admin can view *this app* in.
export const SUPPORTED_LOCALES = ["sv-SE", "en", "es"] as const;
export type AdminLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AdminLocale = "sv-SE";
export const LOCALE_COOKIE_NAME = "admin_locale";

// A language's own name is never translated — a Spanish-only reader must
// still recognize "English" as English while the rest of the UI is in a
// language they don't read, so these are fixed labels, not next-intl
// message keys (unlike languageSwitcherLabel in Common, which *is*
// translated per active locale — see language-switcher.tsx).
export const LOCALE_LABELS: Record<AdminLocale, string> = {
  "sv-SE": "Svenska",
  en: "English",
  es: "Español",
};
