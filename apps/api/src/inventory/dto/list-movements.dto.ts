import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";

// from/to are explicit UTC instants only — same convention as the
// dashboard-metrics checkpoint (no named-period presets, no timezone
// conversion in the API). Cross-field validation (from < to) happens in
// InventoryService, not here, matching that same precedent.
export const listMovementsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(["SALE", "RETURN", "CANCELLATION", "RESTOCK", "ADJUSTMENT"]).optional(),
  variantId: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
