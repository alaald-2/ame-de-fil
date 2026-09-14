import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";

export const loginSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
