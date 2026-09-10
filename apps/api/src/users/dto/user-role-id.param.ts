import { z } from "zod";

export const userRoleIdParamSchema = z.object({ id: z.string().min(1), roleId: z.string().min(1) });
export type UserRoleIdParam = z.infer<typeof userRoleIdParamSchema>;
