import { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";

// "ALL" is an explicit sentinel (same convention as inventory's
// list-reservations.dto.ts) — an invalid status string still 400s via Zod,
// only this exact literal opts out of filtering. Default OPEN: the Tasks
// list's whole purpose is surfacing outstanding work, same reasoning as
// listReservations defaulting to PENDING.
const taskTypeSchema = z.enum([
  "START_PRODUCTION",
  "FINISH_PRODUCTION",
  "QUALITY_CHECK",
  "PACK_ORDER",
  "SHIP_ORDER",
  "FOLLOW_UP_DELAYED_ORDER",
  "RESTOCK",
  "CUSTOMER_FOLLOW_UP",
  "FOLLOW_UP_PENDING_REFUND",
  "FOLLOW_UP_FAILED_REFUND",
  "REVIEW_DISPUTE",
  "INSPECT_RETURN",
  "GENERAL",
]);

// `assignee`: "me" resolves against the caller's own userId (the one
// timezone-free, caller-relative filter this endpoint needs — everything
// else, e.g. an urgency bucket, is left to the admin frontend to compute
// against the viewer's local day and pass down as explicit dueBefore/
// dueFrom instants, the same "no timezone math in the API" posture the
// dashboard endpoint already established). "unassigned" matches
// assignedToUserId IS NULL. Any other value is treated as a literal userId.
export const listTasksQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["OPEN", "DONE", "CANCELED", "ALL"]).default("OPEN"),
  type: taskTypeSchema.optional(),
  source: z.enum(["MANUAL", "AUTOMATED"]).optional(),
  assignee: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  dueBefore: z.iso.datetime().optional(),
  dueFrom: z.iso.datetime().optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
