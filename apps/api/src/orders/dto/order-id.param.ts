import { z } from "zod";

export const orderIdParamSchema = z.object({ orderId: z.string().min(1) });
export type OrderIdParam = z.infer<typeof orderIdParamSchema>;
