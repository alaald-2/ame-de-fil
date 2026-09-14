import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";

export const verifyOtpSchema = z.object({
  email: normalizedEmailSchema,
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
