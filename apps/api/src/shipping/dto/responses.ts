import { z } from "zod";

export const shippingMethodResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  price: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
  minDeliveryDays: z.number().int(),
  maxDeliveryDays: z.number().int(),
});

export const listShippingMethodsResponseSchema = z.array(shippingMethodResponseSchema);
