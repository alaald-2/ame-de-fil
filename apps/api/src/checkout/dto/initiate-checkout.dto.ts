import { z } from "zod";
import { localeSchema } from "@ame-de-fil/validation";

// Sweden-only market (DECISIONS.md ADR-021) — checkout enforces this at the
// data-entry boundary, not just by convention: no shipping/billing address
// outside Sweden is accepted, matching ManualShippingProvider and the VAT
// model, both of which assume a Swedish delivery.
const addressSchema = z.object({
  name: z.string().min(1).max(200),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  postalCode: z.string().min(1).max(20),
  city: z.string().min(1).max(200),
  country: z.literal("SE").default("SE"),
  phone: z.string().max(50).optional(),
});

export const initiateCheckoutSchema = z.object({
  locale: localeSchema,
  shippingMethodId: z.string().min(1),
  // Required only for a guest (no session) checkout — cross-field, checked
  // in CheckoutService against the resolved identity, since a pure schema
  // has no notion of "is this caller authenticated."
  guestEmail: z.email().optional(),
  shippingAddress: addressSchema,
  // Defaults to shippingAddress when omitted (checked in CheckoutService).
  billingAddress: addressSchema.optional(),
});
export type InitiateCheckoutInput = z.infer<typeof initiateCheckoutSchema>;
export type CheckoutAddress = z.infer<typeof addressSchema>;
