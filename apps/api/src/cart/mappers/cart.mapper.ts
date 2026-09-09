import type { Prisma } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { computeAvailability } from "../../common/inventory-availability.ts";
import { resolveTranslation } from "../../catalog/mappers/translation.mapper.ts";
import type { CartResponse } from "../dto/responses.ts";

export type CartItemWithContext = Prisma.CartItemGetPayload<{
  include: {
    variant: {
      include: { product: { include: { translations: true } }; inventoryItem: true };
    };
  };
}>;

export type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        variant: {
          include: { product: { include: { translations: true } }; inventoryItem: true };
        };
      };
    };
  };
}>;

export const CART_INCLUDE = {
  items: {
    include: {
      variant: {
        include: { product: { include: { translations: true } }, inventoryItem: true },
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
  return translation?.name ?? item.variant.sku;
}

export function mapCartItem(
  item: CartItemWithContext,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
) {
  const inventory = item.variant.inventoryItem;
  const { available, availableQuantity } = inventory
    ? computeAvailability(inventory)
    : { available: false, availableQuantity: 0 };

  const amountMinor = item.variant.priceMinor * item.quantity;

  return {
    id: item.id,
    variantId: item.variant.id,
    sku: item.variant.sku,
    productName: resolveDisplayName(item, requestedLocale, defaultLocale),
    quantity: item.quantity,
    unitPrice: { amountMinor: item.variant.priceMinor, currency: "SEK" as const },
    lineTotal: { amountMinor, currency: "SEK" as const },
    available,
    availableQuantity,
    isLimitedEdition: inventory?.isLimitedEdition ?? false,
    productionTimeDays: inventory?.productionTimeDays ?? null,
  };
}

// Prices/totals are always recomputed here from the live variant.priceMinor
// — never trusted from anything the client submitted (checkpoint rule),
// and never cached on the CartItem row itself.
export function mapCart(
  cart: CartWithItems,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
): CartResponse {
  const items = cart.items.map((item) => mapCartItem(item, requestedLocale, defaultLocale));
  const subtotalMinor = items.reduce((sum, item) => sum + item.lineTotal.amountMinor, 0);

  return {
    cartId: cart.id,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: { amountMinor: subtotalMinor, currency: "SEK" },
  };
}

export function emptyCartResponse(): CartResponse {
  return {
    cartId: null,
    items: [],
    itemCount: 0,
    subtotal: { amountMinor: 0, currency: "SEK" },
  };
}
