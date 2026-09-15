import { Locale, type Prisma } from "@ame-de-fil/database";
import { fromPrismaLocale } from "../../common/locale.ts";

// One row per order, scoped by the caller's own userId at the query level
// (orders.service.ts) — never a permission gate, this is "my own data."
export const MY_ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  totalMinor: true,
  currency: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

export type MyOrderListRow = Prisma.OrderGetPayload<{ select: typeof MY_ORDER_LIST_SELECT }>;

export function mapMyOrderListItem(order: MyOrderListRow) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: { amountMinor: order.totalMinor, currency: order.currency },
    itemCount: order._count.items,
    createdAt: order.createdAt.toISOString(),
  };
}

// Trimmed relative to admin-order.mapper.ts's ADMIN_ORDER_DETAIL_SELECT
// (design discussion, docs/plans/customer-order-history): no `user`
// relation at all (redundant — it's always the caller's own account), only
// the one real Payment row per order (never an attempt history — this
// project's checkout design only ever creates one Payment per Order,
// admin-orders.service.ts's own comment), and refunds carry no
// providerRefundId/initiatedByUserId — those are admin-only diagnostic
// fields with no customer-facing use.
export const MY_ORDER_DETAIL_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  locale: true,
  currency: true,
  subtotalMinor: true,
  discountMinor: true,
  shippingMinor: true,
  taxMinor: true,
  totalMinor: true,
  shippingName: true,
  shippingLine1: true,
  shippingLine2: true,
  shippingPostalCode: true,
  shippingCity: true,
  shippingCountry: true,
  shippingPhone: true,
  billingName: true,
  billingLine1: true,
  billingLine2: true,
  billingPostalCode: true,
  billingCity: true,
  billingCountry: true,
  billingPhone: true,
  shippingMethod: { select: { nameSv: true, nameEn: true } },
  items: {
    select: {
      id: true,
      productNameSnapshot: true,
      variantLabelSnapshot: true,
      skuSnapshot: true,
      articleNumberSnapshot: true,
      unitPriceMinor: true,
      quantity: true,
      lineSubtotalMinor: true,
      lineTotalMinor: true,
      madeToOrder: true,
      productionTimeDaysSnapshot: true,
    },
  },
  payments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      method: true,
      status: true,
      amountMinor: true,
      currency: true,
      createdAt: true,
      refunds: {
        orderBy: { createdAt: "desc" as const },
        select: {
          amountMinor: true,
          currency: true,
          reason: true,
          status: true,
          createdAt: true,
          processedAt: true,
        },
      },
    },
  },
  shipments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      status: true,
      carrierName: true,
      trackingNumber: true,
      trackingUrl: true,
      shippedAt: true,
      deliveredAt: true,
    },
  },
  createdAt: true,
  confirmedAt: true,
  canceledAt: true,
} satisfies Prisma.OrderSelect;

export type MyOrderDetailRow = Prisma.OrderGetPayload<{ select: typeof MY_ORDER_DETAIL_SELECT }>;

export function mapMyOrderDetail(order: MyOrderDetailRow) {
  const [payment] = order.payments;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    locale: fromPrismaLocale(order.locale),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productNameSnapshot,
      variantLabel: item.variantLabelSnapshot,
      sku: item.skuSnapshot,
      articleNumber: item.articleNumberSnapshot,
      unitPrice: { amountMinor: item.unitPriceMinor, currency: order.currency },
      quantity: item.quantity,
      lineSubtotal: { amountMinor: item.lineSubtotalMinor, currency: order.currency },
      lineTotal: { amountMinor: item.lineTotalMinor, currency: order.currency },
      madeToOrder: item.madeToOrder,
      productionTimeDaysSnapshot: item.productionTimeDaysSnapshot,
    })),
    subtotal: { amountMinor: order.subtotalMinor, currency: order.currency },
    shipping: { amountMinor: order.shippingMinor, currency: order.currency },
    discount: { amountMinor: order.discountMinor, currency: order.currency },
    tax: { amountMinor: order.taxMinor, currency: order.currency },
    total: { amountMinor: order.totalMinor, currency: order.currency },
    shippingMethodName:
      order.locale === Locale.sv_SE ? order.shippingMethod.nameSv : order.shippingMethod.nameEn,
    shippingAddress: {
      name: order.shippingName,
      line1: order.shippingLine1,
      line2: order.shippingLine2,
      postalCode: order.shippingPostalCode,
      city: order.shippingCity,
      country: order.shippingCountry,
      phone: order.shippingPhone,
    },
    billingAddress: {
      name: order.billingName,
      line1: order.billingLine1,
      line2: order.billingLine2,
      postalCode: order.billingPostalCode,
      city: order.billingCity,
      country: order.billingCountry,
      phone: order.billingPhone,
    },
    payment: payment
      ? {
          method: payment.method,
          status: payment.status,
          amount: { amountMinor: payment.amountMinor, currency: payment.currency },
          createdAt: payment.createdAt.toISOString(),
        }
      : null,
    refunds: (payment?.refunds ?? []).map((refund) => ({
      amount: { amountMinor: refund.amountMinor, currency: refund.currency },
      reason: refund.reason,
      status: refund.status,
      createdAt: refund.createdAt.toISOString(),
      processedAt: refund.processedAt?.toISOString() ?? null,
    })),
    shipments: order.shipments.map((shipment) => ({
      status: shipment.status,
      carrierName: shipment.carrierName,
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      shippedAt: shipment.shippedAt?.toISOString() ?? null,
      deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    })),
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    canceledAt: order.canceledAt?.toISOString() ?? null,
  };
}
