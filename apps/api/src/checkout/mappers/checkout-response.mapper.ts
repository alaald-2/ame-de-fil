import type { Order, OrderItem } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import type { PaymentRecord } from "../../payments/payment-provider.ts";
import type { ShippingQuote } from "../../shipping/shipping-provider.ts";
import type { CheckoutResponse } from "../dto/responses.ts";

// Order/OrderItem rows already hold their own locale-resolved snapshots
// (productNameSnapshot, variantLabelSnapshot) baked in at checkout time —
// this mapper never re-resolves a translation, it only reshapes what was
// already decided and persisted (DATABASE.md §5 immutability principle).
export function mapCheckoutResponse(
  order: Order,
  items: readonly OrderItem[],
  payment: PaymentRecord,
  shippingQuote: ShippingQuote,
  locale: AppLocale,
  reservationExpiresAt: Date | null,
  orderStatusToken: string,
): CheckoutResponse {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    locale,
    items: items.map((item) => ({
      id: item.id,
      productName: item.productNameSnapshot,
      variantLabel: item.variantLabelSnapshot,
      sku: item.skuSnapshot,
      articleNumber: item.articleNumberSnapshot,
      unitPrice: { amountMinor: item.unitPriceMinor, currency: "SEK" },
      quantity: item.quantity,
      taxRatePercent: item.taxRatePercent.toNumber(),
      lineSubtotal: { amountMinor: item.lineSubtotalMinor, currency: "SEK" },
      lineTotal: { amountMinor: item.lineTotalMinor, currency: "SEK" },
    })),
    subtotal: { amountMinor: order.subtotalMinor, currency: "SEK" },
    shipping: { amountMinor: order.shippingMinor, currency: "SEK" },
    discount: { amountMinor: order.discountMinor, currency: "SEK" },
    tax: { amountMinor: order.taxMinor, currency: "SEK" },
    total: { amountMinor: order.totalMinor, currency: "SEK" },
    shippingMethod: {
      id: shippingQuote.shippingMethodId,
      name: locale === "sv-SE" ? shippingQuote.nameSv : shippingQuote.nameEn,
    },
    payment: { id: payment.id, status: payment.status, clientSecret: payment.clientSecret },
    reservationExpiresAt: reservationExpiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    orderStatusToken,
  };
}
