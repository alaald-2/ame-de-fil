import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";
import { passwordStrengthSchema } from "./password-strength.schema.ts";

export const registerSchema = z.object({
  email: normalizedEmailSchema,
  password: passwordStrengthSchema,
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;
