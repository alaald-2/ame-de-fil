import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { fromPrismaLocale } from "../../common/locale.ts";
import type { Locale as PrismaLocale } from "@ame-de-fil/database";

// Picks the requested locale's translation row, falling back to the default
// locale if the requested one is missing — a product/category/collection
// may legitimately be translated in only one locale while content work
// catches up (a real, expected operational state, not an error). Returns
// null only when *neither* locale has a translation, which the caller
// should treat as genuinely not found — there's nothing displayable at all.
export function resolveTranslation<T extends { locale: PrismaLocale }>(
  translations: readonly T[],
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
): T | null {
  const byLocale = new Map(translations.map((t) => [fromPrismaLocale(t.locale), t]));
  return byLocale.get(requestedLocale) ?? byLocale.get(defaultLocale) ?? null;
}
