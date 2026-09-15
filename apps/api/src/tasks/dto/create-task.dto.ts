import { z } from "zod";

// Manual creation only (TaskSource.MANUAL is set unconditionally by the
// service, never accepted from the request body) — TaskAutomationService is
// the only writer of AUTOMATED rows, and it never goes through this DTO.
export const createTaskSchema = z.object({
  type: z.enum([
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
  ]),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
  dueAt: z.iso.datetime().optional(),
  assignedToUserId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  orderItemId: z.string().min(1).optional(),
  productVariantId: z.string().min(1).optional(),
  customerUserId: z.string().min(1).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
