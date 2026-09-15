import { z } from "zod";

// `null` clears assignment back to "Unassigned" — deliberately distinct from
// omitting the field (which ZodValidationPipe already rejects as invalid,
// since this is the only field the route accepts).
export const assignTaskSchema = z.object({
  assignedToUserId: z.string().min(1).nullable(),
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
