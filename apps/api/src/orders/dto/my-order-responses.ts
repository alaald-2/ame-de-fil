import { z } from "zod";

// Duplicated rather than shared — same posture as admin-order-responses.ts's
// own moneySchema comment (checkout/cart/shipping response DTOs each define
// this identical shape locally too; not worth a shared module for).
const moneySchema = z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") });

const myOrderListItemResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  total: moneySchema,
  itemCount: z.number().int(),
  createdAt: z.iso.datetime(),
});

export const listMyOrdersResponseSchema = z.object({
  items: z.array(myOrderListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

const myOrderItemResponseSchema = z.object({
  id: z.string(),
  productName: z.string(),
  variantLabel: z.string(),
  sku: z.string().nullable(),
  articleNumber: z.number().int().nullable(),
  unitPrice: moneySchema,
  quantity: z.number().int(),
  lineSubtotal: moneySchema,
  lineTotal: moneySchema,
  madeToOrder: z.boolean(),
  productionTimeDaysSnapshot: z.number().int().nullable(),
});

const myAddressSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  phone: z.string().nullable(),
});

// No providerRefundId/initiatedByUserId (admin-only diagnostic fields —
// design discussion, docs/plans/customer-order-history).
const myRefundResponseSchema = z.object({
  amount: moneySchema,
  reason: z.string().nullable(),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
  createdAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
});

// Singular and nullable — this project's checkout only ever creates one
// Payment per Order (admin-orders.service.ts's own comment); no
// providerPaymentIntentId, no attempt history.
const myPaymentResponseSchema = z.object({
  method: z.string().nullable(),
  status: z.string(),
  amount: moneySchema,
  createdAt: z.iso.datetime(),
});

const myShipmentResponseSchema = z.object({
  status: z.string(),
  carrierName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  shippedAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
});

export const myOrderDetailResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  locale: z.enum(["sv-SE", "en"]),
  items: z.array(myOrderItemResponseSchema),
  subtotal: moneySchema,
  shipping: moneySchema,
  discount: moneySchema,
  tax: moneySchema,
  total: moneySchema,
  shippingMethodName: z.string(),
  shippingAddress: myAddressSchema,
  billingAddress: myAddressSchema,
  payment: myPaymentResponseSchema.nullable(),
  refunds: z.array(myRefundResponseSchema),
  shipments: z.array(myShipmentResponseSchema),
  createdAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
});
export type MyOrderDetailResponse = z.infer<typeof myOrderDetailResponseSchema>;
export type ListMyOrdersResponse = z.infer<typeof listMyOrdersResponseSchema>;
