import { z } from "zod";

export const slugParamSchema = z.object({ slug: z.string().min(1) });
export type SlugParam = z.infer<typeof slugParamSchema>;

export { paginationQuerySchema, type PaginationQuery } from "../../common/dto/pagination.schema.ts";
export { localeQuerySchema, type LocaleQuery } from "../../common/dto/locale-query.schema.ts";
