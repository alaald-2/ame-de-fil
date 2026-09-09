import { z } from "zod";

export const cartItemResponseSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  quantity: z.number().int(),
  unitPrice: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
  lineTotal: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
  available: z.boolean(),
  availableQuantity: z.number().int().nullable(),
  isLimitedEdition: z.boolean(),
  productionTimeDays: z.number().int().nullable(),
});

export const cartResponseSchema = z.object({
  // null for a visitor with no cart row yet (GET never creates one).
  cartId: z.string().nullable(),
  items: z.array(cartItemResponseSchema),
  itemCount: z.number().int(),
  subtotal: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
});
export type CartResponse = z.infer<typeof cartResponseSchema>;
