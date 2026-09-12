import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../../common/dto/search-query.schema.ts";

// from/to are explicit UTC instants only — same convention as the
// dashboard-metrics checkpoint (no named-period presets, no timezone
// conversion in the API). Cross-field validation (from < to) happens in
// InventoryService, not here, matching that same precedent. `q` matches
// the moved variant's Article Number, SKU, or product name — see
// inventory.service.ts's listMovements.
export const listMovementsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(["SALE", "RETURN", "CANCELLATION", "RESTOCK", "ADJUSTMENT"]).optional(),
  variantId: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  ...searchQuerySchema.shape,
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
