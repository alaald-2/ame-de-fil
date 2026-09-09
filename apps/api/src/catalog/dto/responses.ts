import { z } from "zod";

// Mirrors the mapper output shapes (mappers/*.mapper.ts) for OpenAPI
// documentation and typed-client generation — the mappers remain the
// runtime source of truth for what's actually returned; these schemas exist
// so packages/types' generated client has accurate response types, since
// we control our own output and don't need to re-validate it at runtime.
const moneyResponseSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.literal("SEK"),
});

const variantOptionResponseSchema = z.object({
  key: z.string(),
  value: z.string(),
  label: z.string(),
});

const productVariantResponseSchema = z.object({
  id: z.string(),
  sku: z.string(),
  price: moneyResponseSchema,
  weightGrams: z.number().int().nullable(),
  options: z.array(variantOptionResponseSchema),
  available: z.boolean(),
  isLimitedEdition: z.boolean(),
  productionTimeDays: z.number().int().nullable(),
});

const productImageResponseSchema = z.object({
  url: z.string(),
  altText: z.string().nullable(),
  position: z.number().int(),
});

const taxonomyRefResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

export const productResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  locale: z.enum(["sv-SE", "en"]),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  story: z.string().nullable(),
  careInstructions: z.string().nullable(),
  materials: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  images: z.array(productImageResponseSchema),
  categories: z.array(taxonomyRefResponseSchema),
  collections: z.array(taxonomyRefResponseSchema),
  variants: z.array(productVariantResponseSchema),
});

export const listProductsResponseSchema = z.object({
  items: z.array(productResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const categoryResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
});

export const categoryWithProductsResponseSchema = categoryResponseSchema.extend({
  products: z.array(productResponseSchema),
  productsPage: z.number().int(),
  productsPageSize: z.number().int(),
  productsTotal: z.number().int(),
});

export const collectionResponseSchema = categoryResponseSchema;
export const collectionWithProductsResponseSchema = categoryWithProductsResponseSchema;

export const createProductResponseSchema = z.object({ id: z.string() });
