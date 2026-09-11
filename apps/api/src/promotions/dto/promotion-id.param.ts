import { z } from "zod";

export const promotionIdParamSchema = z.object({ id: z.string().min(1) });
export type PromotionIdParam = z.infer<typeof promotionIdParamSchema>;
