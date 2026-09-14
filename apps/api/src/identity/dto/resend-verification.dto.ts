import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";

export const resendVerificationSchema = z.object({ email: normalizedEmailSchema });
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
