import { z } from "zod";

export const slugParamSchema = z.object({ slug: z.string().min(1) });
export type SlugParam = z.infer<typeof slugParamSchema>;
