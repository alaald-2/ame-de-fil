import { z } from "zod";

// Always a positive quantity — setting it to zero to mean "remove" is not
// supported; DELETE /cart/items/:itemId is the dedicated removal endpoint.
export const updateQuantitySchema = z.object({
  quantity: z.number().int().positive().max(99),
});
export type UpdateQuantityInput = z.infer<typeof updateQuantitySchema>;
