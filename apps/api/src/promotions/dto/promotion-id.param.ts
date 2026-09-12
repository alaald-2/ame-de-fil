import { z } from "zod";

export const promotionIdParamSchema = z.object({ id: z.string().min(1) });
export type PromotionIdParam = z.infer<typeof promotionIdParamSchema>;

export const promotionVariantParamSchema = z.object({
  id: z.string().min(1),
  variantId: z.string().min(1),
});
export type PromotionVariantParam = z.infer<typeof promotionVariantParamSchema>;
