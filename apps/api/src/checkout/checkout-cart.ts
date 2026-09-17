import type { Prisma } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { resolveTranslation } from "../catalog/mappers/translation.mapper.ts";
import { resolveEffectivePrice, type ActivePromotionSummary } from "../promotions/effective-price.ts";
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
  return translation?.name ?? item.variant.sku ?? String(item.variant.articleNumber);
}

export function resolveVariantLabel(item: CheckoutCartItem, locale: AppLocale): string {
  const labels = item.variant.optionValues.map((ov) =>
    locale === "sv-SE" ? ov.optionValue.labelSv : ov.optionValue.labelEn,
  );
  return labels.length > 0
    ? labels.join(" / ")
    : (item.variant.sku ?? String(item.variant.articleNumber));
}

export interface OrderItemSnapshot extends PricedLine {
  productVariantId: string;
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  skuSnapshot: string | null;
  articleNumberSnapshot: number;
  // DECISIONS.md ADR-030 — snapshot of InventoryItem.tracksStock/
  // productionTimeDays at checkout-start, immutable from then on (same
  // principle as the price/tax/name snapshots above).
  madeToOrder: boolean;
  productionTimeDaysSnapshot: number | null;
  // Promotion snapshot (schema.prisma's own OrderItem comment has the full
  // separation-from-Coupon rationale). basePriceMinor is always the
  // variant's own priceMinor at checkout time, whether or not a promotion
  // applied; promotionId/promotionPercentage are null when none did.
  // unitPriceMinor (via PricedLine below) is the price actually charged —
  // basePriceMinor when there was no promotion, effectivePriceMinor when
  // there was.
  basePriceMinor: number;
  promotionId: string | null;
  promotionPercentage: number | null;
}

export function buildOrderItemSnapshot(
  item: CheckoutCartItem,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
  taxRatePercent: number,
  promotion: ActivePromotionSummary | undefined,
): OrderItemSnapshot {
  const effective = resolveEffectivePrice(item.variant.priceMinor, promotion);

  return {
    productVariantId: item.variant.id,
    productNameSnapshot: resolveProductName(item, requestedLocale, defaultLocale),
    variantLabelSnapshot: resolveVariantLabel(item, requestedLocale),
    skuSnapshot: item.variant.sku,
    articleNumberSnapshot: item.variant.articleNumber,
    madeToOrder: !(item.variant.inventoryItem?.tracksStock ?? true),
    productionTimeDaysSnapshot: item.variant.inventoryItem?.productionTimeDays ?? null,
    basePriceMinor: effective.basePriceMinor,
    promotionId: effective.promotion?.id ?? null,
    promotionPercentage: effective.promotion?.percentage ?? null,
    ...priceLine(effective.effectivePriceMinor, item.quantity, taxRatePercent),
  };
}

