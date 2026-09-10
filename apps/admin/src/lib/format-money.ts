// SEK-only (DECISIONS.md ADR-021) — no currency parameter, deliberately.
// Mirrors apps/storefront/src/lib/format-money.ts (small, per-app helper —
// not worth a shared package for one function, same precedent as
// error-message.ts elsewhere in this codebase).
export function formatMoney(amountMinor: number, locale: "sv-SE" | "en"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "SEK" }).format(
    amountMinor / 100,
  );
}
