import { z } from "zod";

export const productImageIdParamSchema = z.object({
  id: z.string().min(1),
  imageId: z.string().min(1),
});
export type ProductImageIdParam = z.infer<typeof productImageIdParamSchema>;
