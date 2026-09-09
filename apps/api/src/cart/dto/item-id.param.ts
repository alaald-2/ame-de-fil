import { z } from "zod";

export const itemIdParamSchema = z.object({ itemId: z.string().min(1) });
export type ItemIdParam = z.infer<typeof itemIdParamSchema>;
