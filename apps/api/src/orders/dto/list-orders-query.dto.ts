import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";

// Both optional filters exist only so the Dashboard's own alert lines
// (disputed payments, failed refunds) have somewhere real to link to —
// see admin-orders.service.ts's listOrders for the "any payment/refund
// matches" semantics. Values match the Prisma PaymentStatus/RefundStatus
// enums exactly (schema.prisma), not redefined independently.
export const listAdminOrdersQuerySchema = paginationQuerySchema.extend({
  paymentStatus: z
    .enum(["PENDING", "AUTHORIZED", "PAID", "FAILED", "CANCELED", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"])
    .optional(),
  refundStatus: z.enum(["PENDING", "SUCCEEDED", "FAILED"]).optional(),
});
export type ListAdminOrdersQuery = z.infer<typeof listAdminOrdersQuerySchema>;
