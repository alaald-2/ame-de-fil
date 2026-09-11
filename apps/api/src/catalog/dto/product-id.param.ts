import { z } from "zod";

export const productIdParamSchema = z.object({ id: z.string().min(1) });
export type ProductIdParam = z.infer<typeof productIdParamSchema>;
