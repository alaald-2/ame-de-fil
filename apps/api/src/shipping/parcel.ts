import type { ParcelInfo } from "./shipping-provider.ts";

// Shared by CheckoutService (cart items, pre-payment) and
// AdminOrdersService (order items, at ship time) — both need to turn "N
// line items with a variant each" into one aggregate ParcelInfo, and the
// weight/dimension fallback policy below must stay identical between them
// so a live Shipmondo quote at checkout and a real shipment created later
// for the same order use the same physical assumptions.
export interface ParcelSourceItem {
  quantity: number;
  variant: {
    weightGrams: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
  };
}

// Per-unit fallback when a variant has no weightGrams set — admin UI only
// exposes weightGrams today (product-variants-form.tsx), so most variants
// realistically go through this path, not a rare edge case. 300g is a
// placeholder sized for this store's typical product category (thread/
// fiber-craft goods), not a measured figure — a real carrier quote
// (ShipmondoShippingProvider) needs *some* number, and a plainly-documented
// guess beats silently omitting weight from every quote request.
const FALLBACK_UNIT_WEIGHT_GRAMS = 300;

// Single aggregate parcel for the whole order — no bin-packing into
// multiple boxes. Reasonable for v1's order volume/product size; a carrier
// quote for one oversized combined parcel is a defensible (if pessimistic)
// approximation, not a correctness bug. Dimensions are omitted entirely
// (undefined, not a guessed number) when nothing in the items has them set,
// since ProductVariant.lengthMm/widthMm/heightMm have no admin UI yet — a
// caller that needs dimensions (ShipmondoShippingProvider) applies its own
// documented default box size, kept there rather than here so this function
// only ever reports what the items actually know.
export function computeParcelInfo(items: readonly ParcelSourceItem[]): ParcelInfo {
  const weightGrams = items.reduce(
    (sum, item) => sum + (item.variant.weightGrams ?? FALLBACK_UNIT_WEIGHT_GRAMS) * item.quantity,
    0,
  );

  // Bounding box: the largest single dimension present across all lines,
  // per axis — not a real packing computation, but never underestimates
  // what has to physically fit. Omitted (all three, together) unless every
  // line contributes a value for that axis; a partial max across only some
  // lines would understate the box for the lines with no data at all.
  const hasAllLengths = items.every((item) => item.variant.lengthMm != null);
  const hasAllWidths = items.every((item) => item.variant.widthMm != null);
  const hasAllHeights = items.every((item) => item.variant.heightMm != null);

  return {
    weightGrams,
    lengthMm: hasAllLengths ? Math.max(...items.map((item) => item.variant.lengthMm!)) : undefined,
    widthMm: hasAllWidths ? Math.max(...items.map((item) => item.variant.widthMm!)) : undefined,
    heightMm: hasAllHeights ? Math.max(...items.map((item) => item.variant.heightMm!)) : undefined,
  };
}
