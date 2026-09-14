import { z } from "zod";
import { passwordStrengthSchema } from "./password-strength.schema.ts";

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordStrengthSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
