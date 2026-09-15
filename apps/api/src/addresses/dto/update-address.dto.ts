import { z } from "zod";
import { createAddressSchema } from "./create-address.dto.ts";

// Every field optional/partial (a PATCH, not a full replace) — except
// `isDefault`, which is narrowed to `literal(true)` rather than reusing the
// plain boolean from createAddressSchema. There is deliberately no
// client-facing way to set isDefault: false directly (design discussion,
// docs/plans — the default-address invariant: whenever a customer has >=1
// address, exactly one is always the default). "Unsetting" a default only
// ever happens as a side effect of a *different* address becoming the new
// default, or of the default address being deleted — never a standalone
// PATCH on the current default. Omitting `isDefault` entirely leaves it
// unchanged.
export const updateAddressSchema = createAddressSchema.partial().extend({
  isDefault: z.literal(true).optional(),
});
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
