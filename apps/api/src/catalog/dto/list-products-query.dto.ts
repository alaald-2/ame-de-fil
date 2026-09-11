import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";

// Optional drill-down filter so the admin products list can be narrowed to
// one lifecycle state (e.g. hide everything but ARCHIVED) instead of always
// showing every product ever created in one updatedAt-ordered list — same
// shape as list-orders-query.dto.ts's paymentStatus/refundStatus filters.
export const listAdminProductsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});
export type ListAdminProductsQuery = z.infer<typeof listAdminProductsQuerySchema>;
