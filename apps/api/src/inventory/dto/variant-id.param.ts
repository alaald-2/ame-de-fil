import { z } from "zod";

export const variantIdParamSchema = z.object({ variantId: z.string().min(1) });
export type VariantIdParam = z.infer<typeof variantIdParamSchema>;
