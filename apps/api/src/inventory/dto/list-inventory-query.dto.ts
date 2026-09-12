import type { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../../common/dto/search-query.schema.ts";

// Shared by both GET /admin/inventory and GET /admin/inventory/low-stock —
// identical shape (paginate + optionally search by the variant's Article
// Number, SKU, or product name), just a different filter/ordering inside
// InventoryService itself. `q` is search-query.schema.ts's own shared field.
export const listInventoryQuerySchema = paginationQuerySchema.extend({
  ...searchQuerySchema.shape,
});
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
