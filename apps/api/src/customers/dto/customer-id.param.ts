import { z } from "zod";

export const customerIdParamSchema = z.object({ id: z.string().min(1) });
export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
