import { z } from "zod";

// All optional, matching Shipment's own nullable columns (DECISIONS.md
// ADR-022 — free text, non-committal, no carrier chosen yet). An admin
// without a tracking number yet (e.g. a local hand-delivery) can still
// mark an order shipped. Fallback only as of ADR-039: when the active
// SHIPPING_PROVIDER can create a real shipment for this order's method
// (ShipmondoShippingProvider), AdminOrdersService.markShipped uses that
// live result instead and these fields are ignored — they still matter for
// ManualShippingProvider, or any Shipmondo product not in its
// SUPPORTED_PRODUCTS list.
export const markShippedSchema = z.object({
  carrierName: z.string().min(1).max(200).optional(),
  trackingNumber: z.string().min(1).max(200).optional(),
  trackingUrl: z.url().max(2000).optional(),
});
export type MarkShippedInput = z.infer<typeof markShippedSchema>;
