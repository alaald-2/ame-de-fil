import type { AdminLocale } from "../i18n/config";

// SEK-only (DECISIONS.md ADR-021) — no currency parameter, deliberately.
// `locale` only affects number punctuation/grouping (e.g. "2 034,00 kr" vs
// "$2,034.00"-shaped grouping) — it never changes the currency itself, so
// the admin UI's own display language (sv-SE/en/es) can format this
// independently of the storefront's Sweden-only locale strategy. Mirrors
// apps/storefront/src/lib/format-money.ts (small, per-app helper — not
// worth a shared package for one function, same precedent as
// error-message.ts elsewhere in this codebase).
export function formatMoney(amountMinor: number, locale: AdminLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "SEK" }).format(
    amountMinor / 100,
  );
}
