import type { Locale as AppLocale } from "@ame-de-fil/validation";
import type { Prisma } from "@ame-de-fil/database";
import { resolveTranslation } from "./translation.mapper.ts";

export type CategoryWithRelations = Prisma.CategoryGetPayload<{
  include: { translations: true };
}>;

export interface CategoryResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export function mapCategory(
  category: CategoryWithRelations,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
): CategoryResponse | null {
  const t = resolveTranslation(category.translations, requestedLocale, defaultLocale);
  if (!t) return null;
  return {
    id: category.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    metaTitle: t.metaTitle,
    metaDescription: t.metaDescription,
  };
}
