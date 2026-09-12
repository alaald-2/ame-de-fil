import { z } from "zod";
import { localeSchema } from "@ame-de-fil/validation";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const productTranslationInputSchema = z.object({
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

const productOptionValueInputSchema = z.object({
  value: z.string().min(1).max(100).regex(SLUG_PATTERN, "must be lowercase, hyphen-separated"),
  labelSv: z.string().min(1).max(100),
  labelEn: z.string().min(1).max(100),
});

const productOptionInputSchema = z.object({
  key: z.string().min(1).max(50).regex(SLUG_PATTERN, "must be lowercase, hyphen-separated"),
  values: z.array(productOptionValueInputSchema).min(1),
});

const productVariantInputSchema = z.object({
  // Optional business/vendor code — articleNumber (auto-assigned by the
  // database on create, see admin-products.service.ts) is the permanent
  // identifier now; this is never required to create a variant.
  sku: z.string().min(1).max(100).optional(),
  priceMinor: z.number().int().nonnegative(),
  taxClassCode: z.string().min(1),
  weightGrams: z.number().int().positive().optional(),
  // Maps option key -> selected value slug, e.g. { color: "rust", size: "m" }.
  // Every key must match one of `options[].key` above, and every value must
  // be one of that option's declared `values[].value` — checked in the
  // service (ProductsService.createProduct), not expressible in Zod's
  // static shape alone since it's a cross-field, data-dependent constraint.
  selectedOptionValues: z.record(z.string(), z.string()).default({}),
  initialStock: z.number().int().nonnegative().default(0),
  tracksStock: z.boolean().default(true),
  isLimitedEdition: z.boolean().default(false),
  productionTimeDays: z.number().int().positive().optional(),
});

// Currency is deliberately absent — SEK-only for v1 (DECISIONS.md ADR-021),
// hardcoded server-side, never accepted from the client.
export const createProductSchema = z.object({
  translations: z.array(productTranslationInputSchema).min(1),
  options: z.array(productOptionInputSchema).default([]),
  variants: z.array(productVariantInputSchema).min(1),
  categoryIds: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;
