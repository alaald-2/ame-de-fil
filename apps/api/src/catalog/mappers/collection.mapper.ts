import type { Locale as AppLocale } from "@ame-de-fil/validation";
import type { Prisma } from "@ame-de-fil/database";
import { resolveTranslation } from "./translation.mapper.ts";

export type CollectionWithRelations = Prisma.CollectionGetPayload<{
  include: { translations: true };
}>;

export interface CollectionResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export function mapCollection(
  collection: CollectionWithRelations,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
): CollectionResponse | null {
  const t = resolveTranslation(collection.translations, requestedLocale, defaultLocale);
  if (!t) return null;
  return {
    id: collection.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    metaTitle: t.metaTitle,
    metaDescription: t.metaDescription,
  };
}
