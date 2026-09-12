import { z } from "zod";

// Mirrors catalog/dto/responses.ts's own pattern: these document the
// mapper's actual output shape for OpenAPI/the generated typed client — the
// mapper (mappers/admin-promotion.mapper.ts) remains the runtime source of
// truth.
const promotionVariantSummarySchema = z.object({
  variantId: z.string(),
  articleNumber: z.number().int(),
  sku: z.string().nullable(),
  productId: z.string(),
  productName: z.string(),
});

export const createPromotionResponseSchema = z.object({ id: z.string() });

export const adminPromotionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  percentage: z.number().int(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  active: z.boolean(),
  // Distinct from `active`: a scheduled-but-not-yet-started or an expired
  // promotion is `active: true` but `effective: false` — this is exactly
  // effective-price.ts's isPromotionCurrentlyEffective(promotion, now),
  // computed once at read time so the admin list/detail can show it without
  // reimplementing the rule client-side.
  effective: z.boolean(),
  variants: z.array(promotionVariantSummarySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminPromotionListItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  percentage: z.number().int(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  active: z.boolean(),
  effective: z.boolean(),
  variantCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const listAdminPromotionsResponseSchema = z.object({
  items: z.array(adminPromotionListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
