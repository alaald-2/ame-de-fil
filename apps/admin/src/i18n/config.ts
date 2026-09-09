export const SUPPORTED_LOCALES = ["sv-SE", "en"] as const;
export type AdminLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AdminLocale = "sv-SE";
export const LOCALE_COOKIE_NAME = "admin_locale";
