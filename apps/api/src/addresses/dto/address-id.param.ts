import { z } from "zod";

export const addressIdParamSchema = z.object({ addressId: z.string().min(1) });
export type AddressIdParam = z.infer<typeof addressIdParamSchema>;
