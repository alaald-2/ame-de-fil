import { z } from "zod";

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

// Never a customer's own name/email beyond what's needed to identify the
// row in a list — same "just enough to cross-reference the real detail
// page" posture as inventory's reservationListItemResponseSchema.
const taskUserRefSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string(),
});

export const taskResponseSchema = z.object({
  id: z.string(),
  type: taskTypeSchema,
  source: z.enum(["MANUAL", "AUTOMATED"]),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.enum(["OPEN", "DONE", "CANCELED"]),
  dueAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  assignedTo: taskUserRefSchema.nullable(),
  createdBy: taskUserRefSchema.nullable(),
  customer: taskUserRefSchema.nullable(),
  order: z.object({ id: z.string(), orderNumber: z.string() }).nullable(),
  orderItem: z.object({ id: z.string(), productNameSnapshot: z.string() }).nullable(),
  variant: z.object({ id: z.string(), articleNumber: z.number().int(), productName: z.string() }).nullable(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const listTasksResponseSchema = z.object({
  items: z.array(taskResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

// Populates the assignee picker — deliberately its own minimal endpoint
// (GET /admin/tasks/assignees) rather than reusing GET /admin/users, so
// Tasks' own permission boundary (tasks.view) is self-contained and never
// requires a role to also hold users.view just to assign a task.
export const taskAssigneeResponseSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string(),
});
export const listTaskAssigneesResponseSchema = z.array(taskAssigneeResponseSchema);
