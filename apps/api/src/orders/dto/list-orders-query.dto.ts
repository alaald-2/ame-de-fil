import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../../common/dto/search-query.schema.ts";

// Both optional status filters exist only so the Dashboard's own alert
// lines (disputed payments, failed refunds) have somewhere real to link to
// — see admin-orders.service.ts's listOrders for the "any payment/refund
// matches" semantics. Values match the Prisma PaymentStatus/RefundStatus
// enums exactly (schema.prisma), not redefined independently. `q`
// (search-query.schema.ts) matches order number, customer name/email/
// phone (registered or guest), and any line item's SKU/Article Number.
export const listAdminOrdersQuerySchema = paginationQuerySchema.extend({
  paymentStatus: z
    .enum([
      "PENDING",
      "AUTHORIZED",
      "PAID",
      "FAILED",
      "CANCELED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
      "DISPUTED",
    ])
    .optional(),
  refundStatus: z.enum(["PENDING", "SUCCEEDED", "FAILED"]).optional(),
  ...searchQuerySchema.shape,
});
export type ListAdminOrdersQuery = z.infer<typeof listAdminOrdersQuerySchema>;
