import { Locale, type Prisma } from "@ame-de-fil/database";
import { fromPrismaLocale } from "../../common/locale.ts";

// Only these four User columns are ever selected — never the raw relation
// — so a password hash or TOTP secret can never reach an admin response
// even if this select is later extended carelessly elsewhere.
const CUSTOMER_SELECT = {
  select: { id: true, email: true, firstName: true, lastName: true },
} as const;

export const ADMIN_ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  totalMinor: true,
  currency: true,
  guestEmail: true,
  user: CUSTOMER_SELECT,
  // One query, not N+1 — Prisma batches a per-parent `take: 1` relation
  // load into a single additional query across every matched order (the
  // same idiom orders.service.ts's getStatus already uses for the same
  // "latest payment status" need).
  payments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { status: true },
  },
} satisfies Prisma.OrderSelect;

export type AdminOrderListRow = Prisma.OrderGetPayload<{ select: typeof ADMIN_ORDER_LIST_SELECT }>;

function mapCustomer(
  guestEmail: string | null,
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null,
) {
  if (user) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
    return { userId: user.id, email: user.email, name };
  }
  // checkout.service.ts requires one of auth/guestEmail — an order with
  // neither is not a real state this mapper needs to tolerate silently.
  return { userId: null, email: guestEmail!, name: null };
}

export function mapAdminOrderListItem(order: AdminOrderListRow) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customer: mapCustomer(order.guestEmail, order.user),
    total: { amountMinor: order.totalMinor, currency: order.currency },
    paymentStatus: order.payments[0]?.status ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

export const ADMIN_ORDER_DETAIL_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  locale: true,
  currency: true,
  guestEmail: true,
  user: CUSTOMER_SELECT,
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
  pickupPointId: true,
  pickupPointName: true,
  pickupPointAddress: true,
  items: {
    select: {
      id: true,
      productNameSnapshot: true,
      variantLabelSnapshot: true,
      skuSnapshot: true,
      articleNumberSnapshot: true,
      unitPriceMinor: true,
      quantity: true,
      taxRatePercent: true,
      lineSubtotalMinor: true,
      lineTotalMinor: true,
      madeToOrder: true,
      productionTimeDaysSnapshot: true,
    },
  },
  payments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      provider: true,
      providerPaymentIntentId: true,
      method: true,
      status: true,
      amountMinor: true,
      currency: true,
      createdAt: true,
      refunds: {
        orderBy: { createdAt: "desc" as const },
        select: {
          id: true,
          amountMinor: true,
          currency: true,
          reason: true,
          status: true,
          providerRefundId: true,
          createdAt: true,
          processedAt: true,
        },
      },
    },
  },
  shipments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      status: true,
      carrierName: true,
      trackingNumber: true,
      trackingUrl: true,
      providerShipmentId: true,
      shippedAt: true,
      deliveredAt: true,
    },
  },
  createdAt: true,
  confirmedAt: true,
  canceledAt: true,
} satisfies Prisma.OrderSelect;

export type AdminOrderDetailRow = Prisma.OrderGetPayload<{
  select: typeof ADMIN_ORDER_DETAIL_SELECT;
}>;

export function mapAdminOrderDetail(order: AdminOrderDetailRow) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    locale: fromPrismaLocale(order.locale),
    customer: mapCustomer(order.guestEmail, order.user),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productNameSnapshot,
      variantLabel: item.variantLabelSnapshot,
      sku: item.skuSnapshot,
      articleNumber: item.articleNumberSnapshot,
      unitPrice: { amountMinor: item.unitPriceMinor, currency: order.currency },
      quantity: item.quantity,
      taxRatePercent: item.taxRatePercent.toNumber(),
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
    pickupPointId: order.pickupPointId,
    pickupPointName: order.pickupPointName,
    pickupPointAddress: order.pickupPointAddress,
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
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      providerPaymentIntentId: payment.providerPaymentIntentId,
      method: payment.method,
      status: payment.status,
      amount: { amountMinor: payment.amountMinor, currency: payment.currency },
      createdAt: payment.createdAt.toISOString(),
      refunds: payment.refunds.map((refund) => ({
        id: refund.id,
        amount: { amountMinor: refund.amountMinor, currency: refund.currency },
        reason: refund.reason,
        status: refund.status,
        providerRefundId: refund.providerRefundId,
        createdAt: refund.createdAt.toISOString(),
        processedAt: refund.processedAt?.toISOString() ?? null,
      })),
    })),
    shipments: order.shipments.map((shipment) => ({
      id: shipment.id,
      status: shipment.status,
      carrierName: shipment.carrierName,
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      providerShipmentId: shipment.providerShipmentId,
      shippedAt: shipment.shippedAt?.toISOString() ?? null,
      deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    })),
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    canceledAt: order.canceledAt?.toISOString() ?? null,
  };
}
