import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../../common/dto/search-query.schema.ts";

// Optional drill-down filter so the admin products list can be narrowed to
// one lifecycle state (e.g. hide everything but ARCHIVED) instead of always
// showing every product ever created in one updatedAt-ordered list — same
// shape as list-orders-query.dto.ts's paymentStatus/refundStatus filters.
// `q` (search-query.schema.ts) matches product name/slug and any variant's
// SKU/Article Number — see admin-products.service.ts's own list().
export const listAdminProductsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  ...searchQuerySchema.shape,
});
export type ListAdminProductsQuery = z.infer<typeof listAdminProductsQuerySchema>;
