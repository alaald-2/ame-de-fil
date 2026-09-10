import { z } from "zod";

export const userIdParamSchema = z.object({ id: z.string().min(1) });
export type UserIdParam = z.infer<typeof userIdParamSchema>;
