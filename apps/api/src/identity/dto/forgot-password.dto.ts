import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";

export const forgotPasswordSchema = z.object({ email: normalizedEmailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
