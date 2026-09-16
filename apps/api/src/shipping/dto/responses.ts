import { z } from "zod";

export const shippingMethodResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  price: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
  minDeliveryDays: z.number().int(),
  maxDeliveryDays: z.number().int(),
  requiresPickupPoint: z.boolean(),
});

export const listShippingMethodsResponseSchema = z.array(shippingMethodResponseSchema);

export const pickupPointResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  postalCode: z.string(),
  city: z.string(),
});

export const listPickupPointsResponseSchema = z.array(pickupPointResponseSchema);
