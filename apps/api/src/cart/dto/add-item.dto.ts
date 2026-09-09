import { z } from "zod";

export const addItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(99),
});
export type AddItemInput = z.infer<typeof addItemSchema>;
