import { localeQuerySchema, paginationQuerySchema } from "./common.schemas.ts";
import { searchQuerySchema } from "../../common/dto/search-query.schema.ts";
import { z } from "zod";

export const listProductsQuerySchema = localeQuerySchema
  .extend({
    category: z.string().min(1).optional(),
    collection: z.string().min(1).optional(),
  })
  .extend(paginationQuerySchema.shape)
  .extend(searchQuerySchema.shape);
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
