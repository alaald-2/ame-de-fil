import type { Prisma } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { resolveTranslation } from "../catalog/mappers/translation.mapper.ts";
import { priceLine, type PricedLine } from "./pricing.ts";

// A richer include than cart's own CART_INCLUDE (mappers/cart.mapper.ts) —
// checkout also needs taxClassId (a plain scalar, already present) and the
// option values needed to snapshot a human-readable variant label
// ("Rost / M"), neither of which the cart's own read path needs.
export const CHECKOUT_CART_INCLUDE = {
  items: {
    include: {
      variant: {
        include: {
          product: { include: { translations: true } },
          inventoryItem: true,
          optionValues: { include: { option: true, optionValue: true } },
        },
      },
    },
  },
} as const;

export type CheckoutCart = Prisma.CartGetPayload<{ include: typeof CHECKOUT_CART_INCLUDE }>;
export type CheckoutCartItem = CheckoutCart["items"][number];

export function resolveProductName(
  item: CheckoutCartItem,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
): string {
  const translation = resolveTranslation(
    item.variant.product.translations,
    requestedLocale,
    defaultLocale,
  );
  return translation?.name ?? item.variant.sku;
}

export function resolveVariantLabel(item: CheckoutCartItem, locale: AppLocale): string {
  const labels = item.variant.optionValues.map((ov) =>
    locale === "sv-SE" ? ov.optionValue.labelSv : ov.optionValue.labelEn,
  );
  return labels.length > 0 ? labels.join(" / ") : item.variant.sku;
}

export interface OrderItemSnapshot extends PricedLine {
  productVariantId: string;
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  skuSnapshot: string;
}

export function buildOrderItemSnapshot(
  item: CheckoutCartItem,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
  taxRatePercent: number,
): OrderItemSnapshot {
  return {
    productVariantId: item.variant.id,
    productNameSnapshot: resolveProductName(item, requestedLocale, defaultLocale),
    variantLabelSnapshot: resolveVariantLabel(item, requestedLocale),
    skuSnapshot: item.variant.sku,
    ...priceLine(item.variant.priceMinor, item.quantity, taxRatePercent),
  };
}
