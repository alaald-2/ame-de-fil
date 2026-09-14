import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";

// No `password` field — passwords are always server-generated for a new
// admin/staff account (approved design, admin-users.service.ts) and
// returned once in the creation response, never client-supplied. Capped,
// non-empty name fields, matching this project's existing DTO conventions
// (e.g. checkout's address fields) rather than inventing new bounds.
export const createUserSchema = z.object({
  email: normalizedEmailSchema,
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  // Subject to the same "must be a subset of the actor's own current
  // permissions" check as POST /admin/users/:id/roles — enforced in
  // admin-users.service.ts, not here (Zod only shapes the request, it
  // can't see the caller's permission set).
  initialRoleIds: z.array(z.string().min(1)).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
