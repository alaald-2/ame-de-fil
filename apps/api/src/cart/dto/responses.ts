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
});
export type CartResponse = z.infer<typeof cartResponseSchema>;
