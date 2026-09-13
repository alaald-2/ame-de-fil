import { z } from "zod";

export const heroSlideIdParamSchema = z.object({ id: z.string().min(1) });
export type HeroSlideIdParam = z.infer<typeof heroSlideIdParamSchema>;
