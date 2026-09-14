import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";

export const requestOtpSchema = z.object({ email: normalizedEmailSchema });
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
