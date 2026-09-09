// SEK-only (DECISIONS.md ADR-021) — no currency parameter, deliberately.
export function formatMoney(amountMinor: number, locale: "sv-SE" | "en"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "SEK" }).format(
    amountMinor / 100,
  );
}
