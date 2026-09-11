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

// Admin shapes are genuinely different from the public ones above, not an
// extension of them — the public shape resolves every translation/label to
// one locale for storefront display (mappers/product.mapper.ts), while
// editing needs every locale's content at once (mappers/admin-product.mapper.ts).
const adminProductTranslationResponseSchema = z.object({
  locale: z.enum(["sv-SE", "en"]),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  story: z.string().nullable(),
  careInstructions: z.string().nullable(),
  materials: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
});

const adminProductOptionValueResponseSchema = z.object({
  id: z.string(),
  value: z.string(),
  labelSv: z.string(),
  labelEn: z.string(),
  position: z.number().int(),
});

const adminProductOptionResponseSchema = z.object({
  id: z.string(),
  key: z.string(),
  position: z.number().int(),
  values: z.array(adminProductOptionValueResponseSchema),
});

const adminProductVariantInventoryResponseSchema = z.object({
  onHand: z.number().int(),
  reserved: z.number().int(),
  tracksStock: z.boolean(),
  isLimitedEdition: z.boolean(),
  productionTimeDays: z.number().int().nullable(),
  available: z.boolean(),
});

const adminProductVariantResponseSchema = z.object({
  id: z.string(),
  sku: z.string(),
  priceMinor: z.number().int(),
  taxClassCode: z.string(),
  weightGrams: z.number().int().nullable(),
  isActive: z.boolean(),
  selectedOptionValues: z.record(z.string(), z.string()),
  inventory: adminProductVariantInventoryResponseSchema.nullable(),
});

export const adminProductResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  translations: z.array(adminProductTranslationResponseSchema),
  options: z.array(adminProductOptionResponseSchema),
  categoryIds: z.array(z.string()),
  collectionIds: z.array(z.string()),
  variants: z.array(adminProductVariantResponseSchema),
});

export const adminProductListItemResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  name: z.string(),
  variantCount: z.number().int(),
  minPriceMinor: z.number().int().nullable(),
  maxPriceMinor: z.number().int().nullable(),
  updatedAt: z.iso.datetime(),
});

export const listAdminProductsResponseSchema = z.object({
  items: z.array(adminProductListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

// Shared by AdminCategoriesController and AdminCollectionsController —
// Category/Collection are structurally identical (mappers/admin-taxonomy.mapper.ts).
// Admin shape is genuinely different from categoryResponseSchema/
// collectionResponseSchema above for the same reason adminProductResponseSchema
// differs from productResponseSchema: the public shape resolves to one locale,
// editing needs every locale's content at once.
const adminTaxonomyTranslationResponseSchema = z.object({
  locale: z.enum(["sv-SE", "en"]),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
});

export const adminTaxonomyResponseSchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  productCount: z.number().int(),
  translations: z.array(adminTaxonomyTranslationResponseSchema),
});

export const adminTaxonomyListItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  productCount: z.number().int(),
  updatedAt: z.iso.datetime(),
});

export const listAdminTaxonomyResponseSchema = z.object({
  items: z.array(adminTaxonomyListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const createTaxonomyResponseSchema = z.object({ id: z.string() });
