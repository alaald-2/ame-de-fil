// Small, per-app helper — mirrors format-money.ts's own precedent. `locale`
// is kept as `string` (not `AdminLocale`) since every extracted call site
// already typed it that way.
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}
