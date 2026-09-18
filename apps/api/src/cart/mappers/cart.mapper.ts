import type { Prisma } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { computeAvailability } from "../../common/inventory-availability.ts";
import { resolveTranslation } from "../../catalog/mappers/translation.mapper.ts";
import {
  resolveEffectivePrice,
  type ActivePromotionSummary,
} from "../../promotions/effective-price.ts";
import { computeParcelInfo } from "../../shipping/parcel.ts";
import type { CartResponse } from "../dto/responses.ts";

export type CartItemWithContext = Prisma.CartItemGetPayload<{
  include: {
    variant: {
      include: {
        product: { include: { translations: true; images: true } };
        inventoryItem: true;
        optionValues: { include: { option: true; optionValue: true } };
      };
    };
  };
}>;

export type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        variant: {
          include: {
            product: { include: { translations: true; images: true } };
            inventoryItem: true;
            optionValues: { include: { option: true; optionValue: true } };
          };
        };
      };
    };
  };
}>;

// Mirrors catalog's own PRODUCT_INCLUDE shape (product.mapper.ts) for the
// image/option-value relations — the cart previously fetched neither
// (image/variant-label were never part of this response), purely additive:
// no change to how quantity/price/promotion/stock are computed below.
export const CART_INCLUDE = {
  items: {
    include: {
      variant: {
        include: {
          product: { include: { translations: true, images: true } },
          inventoryItem: true,
          optionValues: { include: { option: true, optionValue: true } },
        },
      },
    },
  },
} as const;

// Unlike inventory's admin-only display name, the cart is customer-facing —
// a Swedish visitor must see the Swedish product name, an English visitor
// the English one, same locale-fallback rule as catalog (resolveTranslation).
function resolveDisplayName(
  item: CartItemWithContext,
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

export function mapCartItem(
  item: CartItemWithContext,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
  promotionsByVariantId: ReadonlyMap<string, ActivePromotionSummary>,
) {
  const inventory = item.variant.inventoryItem;
  const { available, availableQuantity } = inventory
    ? computeAvailability(inventory)
    : { available: false, availableQuantity: 0 };

  // The one place the cart's own price/subtotal are computed — always from
  // the live variant.priceMinor plus whatever promotion is currently
  // effective, never trusted from anything the client submitted (checkpoint
  // rule), and never cached on the CartItem row itself.
  const effective = resolveEffectivePrice(
    item.variant.priceMinor,
    promotionsByVariantId.get(item.variant.id),
  );
  const amountMinor = effective.effectivePriceMinor * item.quantity;

  // Same derivation as catalog's mapProduct/mapProductVariant
  // (product.mapper.ts) — first image by position, options joined into one
  // "Color / Size"-style label, both locale-resolved the same way.
  const primaryImage = [...item.variant.product.images].sort((a, b) => a.position - b.position)[0];
  const image = primaryImage
    ? {
        url: primaryImage.url,
        altText: requestedLocale === "sv-SE" ? primaryImage.altTextSv : primaryImage.altTextEn,
      }
    : null;

  const optionLabels = item.variant.optionValues.map((ov) =>
    requestedLocale === "sv-SE" ? ov.optionValue.labelSv : ov.optionValue.labelEn,
  );
  const variantLabel = optionLabels.length > 0 ? optionLabels.join(" / ") : null;

  return {
    id: item.id,
    variantId: item.variant.id,
    articleNumber: item.variant.articleNumber,
    sku: item.variant.sku,
    productName: resolveDisplayName(item, requestedLocale, defaultLocale),
    image,
    variantLabel,
    quantity: item.quantity,
    unitPrice: { amountMinor: effective.effectivePriceMinor, currency: "SEK" as const },
    // Only non-null when a promotion is actually knocking the price down —
    // avoids sending an identical duplicate of unitPrice on every ordinary
    // line.
    originalUnitPrice:
      effective.promotion !== null
        ? { amountMinor: effective.basePriceMinor, currency: "SEK" as const }
        : null,
    promotion: effective.promotion,
    lineTotal: { amountMinor, currency: "SEK" as const },
    available,
    availableQuantity,
    isLimitedEdition: inventory?.isLimitedEdition ?? false,
    productionTimeDays: inventory?.productionTimeDays ?? null,
  };
}

export function mapCart(
  cart: CartWithItems,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
  promotionsByVariantId: ReadonlyMap<string, ActivePromotionSummary>,
): CartResponse {
  const items = cart.items.map((item) =>
    mapCartItem(item, requestedLocale, defaultLocale, promotionsByVariantId),
  );
  const subtotalMinor = items.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0);

  return {
    cartId: cart.id,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: { amountMinor: subtotalMinor, currency: "SEK" },
    estimatedWeightGrams: computeParcelInfo(cart.items).weightGrams,
  };
}

export function emptyCartResponse(): CartResponse {
  return {
    cartId: null,
    items: [],
    itemCount: 0,
    subtotal: { amountMinor: 0, currency: "SEK" },
    estimatedWeightGrams: 0,
  };
}
