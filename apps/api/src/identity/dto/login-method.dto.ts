import { z } from "zod";
import { normalizedEmailSchema } from "../../common/dto/normalized-email.schema.ts";

export const loginMethodSchema = z.object({ email: normalizedEmailSchema });
export type LoginMethodInput = z.infer<typeof loginMethodSchema>;
