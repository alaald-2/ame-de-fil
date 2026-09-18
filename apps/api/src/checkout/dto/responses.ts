import { z } from "zod";

const moneySchema = z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") });

export const checkoutOrderItemResponseSchema = z.object({
  id: z.string(),
  productName: z.string(),
  variantLabel: z.string(),
  sku: z.string().nullable(),
  articleNumber: z.number().int().nullable(),
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
  payment: z.object({
    id: z.string(),
    status: z.string(),
    // Only present when a real processor issued one (StripePaymentProvider)
    // — undefined for PendingPaymentProvider, which has nothing for the
    // browser to confirm (payment-provider.ts).
    clientSecret: z.string().optional(),
  }),
  // null when the order has no finite-stock reservations at all (an
  // all-made-to-order order) — nothing expires in that case.
  reservationExpiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  // Guest order-status polling credential (PAYMENTS.md §4, DECISIONS.md
  // ADR-024) — returned exactly once, here, in plaintext; only its SHA-256
  // hash is ever persisted (OrderStatusToken). Authenticated callers don't
  // need it (their poll is authorized by session ownership instead), but
  // it's still issued/returned uniformly rather than branching the
  // response shape on auth state.
  orderStatusToken: z.string(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const expireReservationsResponseSchema = z.object({
  releasedReservations: z.number().int(),
  canceledOrders: z.number().int(),
});
export type ExpireReservationsResponse = z.infer<typeof expireReservationsResponseSchema>;
