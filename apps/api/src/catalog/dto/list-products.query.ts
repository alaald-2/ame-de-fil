import { localeQuerySchema, paginationQuerySchema } from "./common.schemas.ts";
import { z } from "zod";

export const listProductsQuerySchema = localeQuerySchema
  .extend({
    category: z.string().min(1).optional(),
    collection: z.string().min(1).optional(),
  })
  .extend(paginationQuerySchema.shape);
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
