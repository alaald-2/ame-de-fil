import { z } from "zod";
import { localeSchema } from "@ame-de-fil/validation";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Same shape as create-product.dto.ts's translation input — a provided
// locale is upserted (matched by the [productId, locale] unique
// constraint), never a full-array replace, so omitting a locale here
// leaves that locale's existing content untouched.
const updateProductTranslationInputSchema = z.object({
  locale: localeSchema,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(SLUG_PATTERN, "must be lowercase, hyphen-separated"),
  description: z.string().max(2000).optional(),
  story: z.string().max(10000).optional(),
  careInstructions: z.string().max(2000).optional(),
  materials: z.string().max(1000).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
});

// Matched by an existing variant id — this never adds or removes a
// variant, only patches fields on one already created (AdminProductsService
// validates the id belongs to this product). Every field optional: only
// what's provided changes.
const updateProductVariantInputSchema = z.object({
  id: z.string().min(1),
  priceMinor: z.number().int().nonnegative().optional(),
  taxClassCode: z.string().min(1).optional(),
  weightGrams: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  isLimitedEdition: z.boolean().optional(),
  productionTimeDays: z.number().int().positive().optional(),
});

// DRAFT -> PUBLISHED -> ARCHIVED only, enforced in the service (a Zod enum
// can't express "no going backward" — that's a state-machine rule, not a
// shape rule).
const productStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const updateProductSchema = z.object({
  translations: z.array(updateProductTranslationInputSchema).min(1).optional(),
  categoryIds: z.array(z.string()).optional(),
  collectionIds: z.array(z.string()).optional(),
  status: productStatusSchema.optional(),
  variants: z.array(updateProductVariantInputSchema).min(1).optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
