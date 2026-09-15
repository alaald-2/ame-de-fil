import { z } from "zod";

export const taskIdParamSchema = z.object({ id: z.string().min(1) });
export type TaskIdParam = z.infer<typeof taskIdParamSchema>;
