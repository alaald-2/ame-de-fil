import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";

// "ALL" is an explicit sentinel, not merely "any unrecognized value skips
// the filter" — an invalid status string still 400s via Zod, only this
// exact literal opts out of filtering. Default PENDING: "current
// reservations" (this endpoint's whole purpose) means the ones still
// actively holding stock.
export const listReservationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["PENDING", "CONSUMED", "EXPIRED", "ALL"]).default("PENDING"),
  variantId: z.string().min(1).optional(),
});
export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;
