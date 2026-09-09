import { z } from "zod";

const moneySchema = z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") });

export const checkoutOrderItemResponseSchema = z.object({
  id: z.string(),
  productName: z.string(),
  variantLabel: z.string(),
  sku: z.string(),
  unitPrice: moneySchema,
  quantity: z.number().int(),
  taxRatePercent: z.number(),
  lineSubtotal: moneySchema,
  lineTotal: moneySchema,
});

export const checkoutResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  locale: z.enum(["sv-SE", "en"]),
  items: z.array(checkoutOrderItemResponseSchema),
  subtotal: moneySchema,
  shipping: moneySchema,
  discount: moneySchema,
  tax: moneySchema,
  total: moneySchema,
  shippingMethod: z.object({ id: z.string(), name: z.string() }),
  payment: z.object({ id: z.string(), status: z.string() }),
  // null when the order has no finite-stock reservations at all (an
  // all-made-to-order order) — nothing expires in that case.
  reservationExpiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
