import { z } from "zod";

// Every field optional — a PATCH-style partial update, same convention as
// update-product.dto.ts. Text fields accept "" to let an admin clear a
// previously-set value (e.g. removing an org number they no longer want
// printed) without needing a separate "unset" signal.
export const updateStoreSettingsSchema = z.object({
  businessName: z.string().max(200).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  orgNumber: z.string().max(50).optional(),
  vatNumber: z.string().max(50).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().max(200).optional(),
  showAddress: z.boolean().optional(),
  showOrgNumber: z.boolean().optional(),
  showVatNumber: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showEmail: z.boolean().optional(),
});
export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;
