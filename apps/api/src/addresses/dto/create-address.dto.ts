import { z } from "zod";

// Field bounds mirror checkout's own addressSchema exactly
// (checkout/dto/initiate-checkout.dto.ts) for consistency — this is the
// same shape a customer already types at checkout, just saved for reuse.
// No `country` field at all: Sweden-only (ADR-021), and unlike checkout
// (which still accepts the literal "SE" from the client for symmetry with
// billingAddress), there is truly only one value here, not worth asking
// for — AddressesService hardcodes it server-side.
export const createAddressSchema = z.object({
  label: z.string().max(50).optional(),
  name: z.string().min(1).max(200),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  postalCode: z.string().min(1).max(20),
  city: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  // The very first address a customer ever saves is forced default
  // regardless of this value (AddressesService) — this only matters once a
  // second address is being added.
  isDefault: z.boolean().optional(),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
