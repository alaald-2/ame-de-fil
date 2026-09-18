import { z } from "zod";

// Editable fields only — type/source/links are fixed at creation (an
// AUTOMATED task's identity is its dedupeKey; letting an admin repoint an
// automated task's orderId, for instance, would break the sweep's own
// idempotency bookkeeping). `dueAt`/`notes` accept `null` explicitly to
// clear a previously-set value, distinct from omitting the field entirely.
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    dueAt: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.notes !== undefined || value.dueAt !== undefined,
    {
      message: "At least one field must be provided",
    },
  );
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
