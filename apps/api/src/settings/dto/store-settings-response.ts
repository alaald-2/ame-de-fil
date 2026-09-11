import { z } from "zod";

export const storeSettingsResponseSchema = z.object({
  businessName: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  orgNumber: z.string().nullable(),
  vatNumber: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  showAddress: z.boolean(),
  showOrgNumber: z.boolean(),
  showVatNumber: z.boolean(),
  showPhone: z.boolean(),
  showEmail: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type StoreSettingsResponse = z.infer<typeof storeSettingsResponseSchema>;
