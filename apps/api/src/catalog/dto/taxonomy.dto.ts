import { z } from "zod";
import { localeSchema } from "@ame-de-fil/validation";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Category and Collection are structurally identical (schema.prisma: same
// id/createdAt/updatedAt, same per-locale translation shape, same
// product-join table) — shared here rather than duplicated once for each,
// since two real, identical instances already exist today (not a guess at
// a future third entity). AdminCategoriesController and
// AdminCollectionsController each import and reuse these same schemas.
const taxonomyTranslationInputSchema = z.object({
  locale: localeSchema,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(SLUG_PATTERN, "must be lowercase, hyphen-separated"),
  description: z.string().max(2000).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
});

export const createTaxonomySchema = z.object({
  translations: z.array(taxonomyTranslationInputSchema).min(1),
});
export type CreateTaxonomyInput = z.infer<typeof createTaxonomySchema>;

// Same upsert-per-locale semantics as Products' updateProductSchema — a
// provided locale is upserted, a locale not included is left untouched.
export const updateTaxonomySchema = z.object({
  translations: z.array(taxonomyTranslationInputSchema).min(1).optional(),
});
export type UpdateTaxonomyInput = z.infer<typeof updateTaxonomySchema>;
