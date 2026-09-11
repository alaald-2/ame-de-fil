import { z } from "zod";

// Duplicated rather than shared (checkout/dto/responses.ts, cart/dto/
// responses.ts, shipping/dto/responses.ts each define the identical
// two-field shape locally already) — this project's established pattern
// for this one, that a shared money-schema module isn't worth extracting
// for. Exported (unlike those) only because refundOrderResponseSchema
// below lives in this same file and needs the identical shape — still not
// worth a dedicated shared module for a two-field object.
export const moneySchema = z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") });

// Order.userId/guestEmail are mutually exclusive by construction
// (checkout.service.ts requires exactly one) — `email` is always the best-
// known contact address either way; `name`/`userId` are only present for a
// registered customer. Never the raw `user` relation — only these four
// fields are ever selected from `User` (admin-orders.service.ts), so a
// password hash or TOTP secret can never reach this response by accident.
const adminOrderCustomerSchema = z.object({
  userId: z.string().nullable(),
  email: z.string(),
  name: z.string().nullable(),
});

const adminOrderListItemResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  customer: adminOrderCustomerSchema,
  total: moneySchema,
  paymentStatus: z.string().nullable(), // null only if no Payment row exists yet
  createdAt: z.iso.datetime(),
});

export const listAdminOrdersResponseSchema = z.object({
  items: z.array(adminOrderListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

const adminOrderItemResponseSchema = z.object({
  id: z.string(),
  productName: z.string(),
  variantLabel: z.string(),
  sku: z.string(),
  unitPrice: moneySchema,
  quantity: z.number().int(),
  taxRatePercent: z.number(),
  lineSubtotal: moneySchema,
  lineTotal: moneySchema,
  madeToOrder: z.boolean(),
  productionTimeDaysSnapshot: z.number().int().nullable(),
});

const adminAddressSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  phone: z.string().nullable(),
});

const adminRefundResponseSchema = z.object({
  id: z.string(),
  amount: moneySchema,
  reason: z.string().nullable(),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
  providerRefundId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
});

const adminPaymentResponseSchema = z.object({
  id: z.string(),
  provider: z.string(),
  providerPaymentIntentId: z.string().nullable(),
  method: z.string().nullable(),
  status: z.string(),
  amount: moneySchema,
  createdAt: z.iso.datetime(),
  refunds: z.array(adminRefundResponseSchema),
});

const adminShipmentResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  carrierName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  shippedAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
});

export const adminOrderDetailResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  locale: z.enum(["sv-SE", "en"]),
  customer: adminOrderCustomerSchema,
  items: z.array(adminOrderItemResponseSchema),
  subtotal: moneySchema,
  shipping: moneySchema,
  discount: moneySchema,
  tax: moneySchema,
  total: moneySchema,
  shippingMethodName: z.string(),
  shippingAddress: adminAddressSchema,
  billingAddress: adminAddressSchema,
  payments: z.array(adminPaymentResponseSchema),
  shipments: z.array(adminShipmentResponseSchema),
  createdAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
});
export type AdminOrderDetailResponse = z.infer<typeof adminOrderDetailResponseSchema>;

// "PENDING" here means Stripe itself returned a non-terminal status
// ("pending"/"requires_action") — synchronous confirmation only (approved
// design), so this response is the caller's *entire* signal; there is no
// later webhook that will resolve it further in this version
// (admin-orders.service.ts / PAYMENTS.md document this limitation).
export const refundOrderResponseSchema = z.object({
  refundId: z.string(),
  status: z.enum(["SUCCEEDED", "FAILED", "PENDING"]),
  amount: moneySchema,
  orderStatus: z.string(),
  paymentStatus: z.string(),
});
export type RefundOrderResponse = z.infer<typeof refundOrderResponseSchema>;
