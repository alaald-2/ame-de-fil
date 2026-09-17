import { z } from "zod";

const promotionSummaryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  percentage: z.number().int(),
});

export const cartItemResponseSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  articleNumber: z.number().int(),
  sku: z.string().nullable(),
  productName: z.string(),
  // Additive only — first product image and the joined option labels
  // ("Color / Size"), same shape/derivation catalog already exposes
  // (product.mapper.ts). Null when a product has no image yet or a variant
  // has no options (this catalog's dev data currently has neither).
  image: z.object({ url: z.string(), altText: z.string().nullable() }).nullable(),
  variantLabel: z.string().nullable(),
  quantity: z.number().int(),
  // The effective (post-promotion) price — what the customer actually
  // pays, and what checkout will charge for this line.
  unitPrice: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
  // Only set when a promotion is currently discounting this line — the
  // base price to show crossed out, same convention as the storefront
  // catalog's own ProductVariantResponse.
  originalUnitPrice: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }).nullable(),
  promotion: promotionSummaryResponseSchema.nullable(),
  lineTotal: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
  available: z.boolean(),
  availableQuantity: z.number().int().nullable(),
  isLimitedEdition: z.boolean(),
  productionTimeDays: z.number().int().nullable(),
});

export const cartResponseSchema = z.object({
  // null for a visitor with no cart row yet (GET never creates one).
  cartId: z.string().nullable(),
  items: z.array(cartItemResponseSchema),
  itemCount: z.number().int(),
  subtotal: z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") }),
  // Same computeParcelInfo (shipping/parcel.ts) checkout/fulfillment already
  // use, applied here to the cart's own items — an estimate for the
  // storefront's pre-submission shipping-method list only (DECISIONS.md
  // ADR-038's disclosed gap: that list previously sent no weight at all, so
  // ShipmondoShippingProvider always returned zero methods there). Checkout
  // submission itself never reads this field — checkout-cart.ts recomputes
  // the authoritative figure from the same transactional cart it already
  // re-validates.
  estimatedWeightGrams: z.number().int(),
});
export type CartResponse = z.infer<typeof cartResponseSchema>;
