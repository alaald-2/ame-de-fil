import { z } from "zod";

export const shippingMethodIdParamSchema = z.object({ shippingMethodId: z.string().min(1) });
export type ShippingMethodIdParam = z.infer<typeof shippingMethodIdParamSchema>;

export const listPickupPointsQuerySchema = z.object({
  postalCode: z.string().min(1).max(20),
});
export type ListPickupPointsQuery = z.infer<typeof listPickupPointsQuerySchema>;
