import { z } from "zod";
import { localeSchema } from "@ame-de-fil/validation";

// postalCode/country/weightGrams are all optional — a caller with no
// destination/parcel context yet (first paint of a shipping-method list)
// still gets a valid response from ManualShippingProvider today; a real
// carrier (ADR-037) is expected to use them to filter/price results once
// present. country is a literal, matching the Sweden-only checkout schema
// (initiate-checkout.dto.ts) rather than accepting arbitrary values here.
export const listShippingMethodsQuerySchema = z.object({
  locale: localeSchema,
  postalCode: z.string().min(1).max(20).optional(),
  country: z.literal("SE").optional(),
  weightGrams: z.coerce.number().int().positive().optional(),
});
export type ListShippingMethodsQuery = z.infer<typeof listShippingMethodsQuerySchema>;
