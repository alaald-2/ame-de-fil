import { z } from "zod";

export const addressResponseSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  name: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  country: z.literal("SE"),
  phone: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AddressResponse = z.infer<typeof addressResponseSchema>;

// Unpaginated — a small, capped-at-MAX_ADDRESSES_PER_USER list
// (AddressesService), unlike orders' listMyOrdersResponseSchema.
export const listAddressesResponseSchema = z.object({
  items: z.array(addressResponseSchema),
});
export type ListAddressesResponse = z.infer<typeof listAddressesResponseSchema>;
